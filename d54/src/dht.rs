use crate::hotness::{HotnessLevel, HotnessTracker, ReplicaManager, MIGRATION_INTERVAL};
use crate::kbucket::{FailureAction, K, BUCKET_COUNT};
use crate::network::{generate_self_signed_cert, Network, NetworkError};
use crate::node_id::{NodeId, NodeInfo};
use crate::rpc::{RttEstimator, ALPHA, BASE_TIMEOUT};
use crate::routing_table::{RoutingTable, RoutingTableStats};
use crate::storage::Storage;
use std::collections::HashSet;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{mpsc, Mutex};
use tracing::{debug, error, info, warn};

pub const PROBE_BATCH_SIZE: usize = 5;
pub const MAX_PARALLEL_PROBES: usize = 10;
pub const MAX_PARALLEL_MIGRATIONS: usize = 5;

pub struct DhtNode {
    local_id: NodeId,
    routing_table: Arc<Mutex<RoutingTable>>,
    network: Arc<Network>,
    storage: Arc<Storage>,
    hotness_tracker: Arc<HotnessTracker>,
    replica_manager: Arc<ReplicaManager>,
    rtt_estimator: Arc<Mutex<RttEstimator>>,
    bootstrap_nodes: Vec<NodeInfo>,
    origin_peer: Option<NodeId>,
}

impl DhtNode {
    pub async fn new(
        local_addr: SocketAddr,
        bootstrap_nodes: Vec<NodeInfo>,
    ) -> Result<(Self, mpsc::Receiver<(crate::rpc::RpcMessage, SocketAddr)>), DhtError> {
        let local_id = NodeId::new();
        Self::with_id(local_addr, local_id, bootstrap_nodes).await
    }

    pub async fn with_id(
        local_addr: SocketAddr,
        local_id: NodeId,
        bootstrap_nodes: Vec<NodeInfo>,
    ) -> Result<(Self, mpsc::Receiver<(crate::rpc::RpcMessage, SocketAddr)>), DhtError> {
        let (cert_chain, key) = generate_self_signed_cert()?;
        let (network, incoming_rx) = Network::new(local_addr, local_id, cert_chain, key)?;

        let routing_table = Arc::new(Mutex::new(RoutingTable::new(local_id)));
        let storage = Arc::new(Storage::new());
        let hotness_tracker = storage.hotness_tracker();
        let replica_manager = storage.replica_manager();
        let rtt_estimator = Arc::new(Mutex::new(RttEstimator::new()));

        info!("DHT node created with ID: {:?}", local_id);
        info!("Listening on: {}", network.local_addr()?);

        Ok((
            Self {
                local_id,
                routing_table,
                network: Arc::new(network),
                storage,
                hotness_tracker,
                replica_manager,
                rtt_estimator,
                bootstrap_nodes,
                origin_peer: None,
            },
            incoming_rx,
        ))
    }

    pub fn set_origin_peer(&mut self, origin_peer: NodeId) {
        self.origin_peer = Some(origin_peer);
        self.hotness_tracker.set_origin_peer(origin_peer);
    }

    pub async fn bootstrap(&self) -> Result<(), DhtError> {
        if self.bootstrap_nodes.is_empty() {
            warn!("No bootstrap nodes configured");
            return Ok(());
        }

        info!("Bootstrapping with {} nodes...", self.bootstrap_nodes.len());

        for bootstrap in &self.bootstrap_nodes {
            let _ = self.ping_node(bootstrap).await;
        }

        let found_nodes = self.find_node(self.local_id).await?;
        info!("Bootstrap completed, found {} nodes", found_nodes.len());

        Ok(())
    }

    pub async fn ping_node(&self, node: &NodeInfo) -> Result<Duration, DhtError> {
        let msg_id = self.network.next_message_id().await;
        let request = crate::rpc::RpcMessage::new_ping(msg_id, self.local_id);

        let timeout = self.rtt_estimator.lock().await.timeout();
        let start = Instant::now();

        match self.network.send_request(node.addr, request, timeout).await {
            Ok(_) => {
                let rtt = start.elapsed();
                self.rtt_estimator.lock().await.update(rtt);

                let mut rt = self.routing_table.lock().await;
                rt.record_node_success(node.id, rtt);

                debug!("Pinged {:?} in {:?}", node.id, rtt);
                Ok(rtt)
            }
            Err(e) => {
                debug!("Failed to ping {:?}: {}", node.id, e);
                let mut rt = self.routing_table.lock().await;
                match rt.record_node_failure(node.id) {
                    FailureAction::Suspected(n) => {
                        debug!("Node {:?} marked as suspected", n.id);
                    }
                    FailureAction::Removed(n) => {
                        debug!("Node {:?} removed from routing table", n.id);
                    }
                    _ => {}
                }
                Err(DhtError::Network(e))
            }
        }
    }

    pub async fn probe_suspected_nodes(&self) -> usize {
        let suspected_nodes = {
            let rt = self.routing_table.lock().await;
            rt.get_suspected_nodes()
        };

        if suspected_nodes.is_empty() {
            return 0;
        }

        debug!("Probing {} suspected nodes...", suspected_nodes.len());

        let mut tasks = Vec::new();
        let nodes_to_probe = suspected_nodes.into_iter().take(MAX_PARALLEL_PROBES);

        for node in nodes_to_probe {
            let network = self.network.clone();
            let rtt_estimator = self.rtt_estimator.clone();
            let routing_table = self.routing_table.clone();
            let local_id = self.local_id;

            let task = tokio::spawn(async move {
                let msg_id = network.next_message_id().await;
                let request = crate::rpc::RpcMessage::new_ping(msg_id, local_id);
                let timeout = rtt_estimator.lock().await.timeout();
                let start = Instant::now();

                match network.send_request(node.addr, request, timeout).await {
                    Ok(_) => {
                        let rtt = start.elapsed();
                        let mut rt = routing_table.lock().await;
                        rt.record_node_success(node.id, rtt);
                        debug!("Suspected node {:?} is alive, RTT: {:?}", node.id, rtt);
                        true
                    }
                    Err(_) => {
                        let mut rt = routing_table.lock().await;
                        match rt.record_node_failure(node.id) {
                            FailureAction::Removed(n) => {
                                debug!("Suspected node {:?} confirmed offline, removed", n.id);
                            }
                            _ => {
                                debug!("Suspected node {:?} still unresponsive", node.id);
                            }
                        }
                        false
                    }
                }
            });
            tasks.push(task);
        }

        let results = futures::future::join_all(tasks).await;
        let alive_count = results.iter().filter(|r| matches!(r, Ok(true))).count();

        alive_count
    }

    pub async fn find_node(&self, target: NodeId) -> Result<Vec<NodeInfo>, DhtError> {
        let mut queried = HashSet::new();
        let mut closest_nodes = Vec::new();
        let mut responded_nodes = Vec::new();
        let mut failed_nodes = HashSet::new();

        {
            let rt = self.routing_table.lock().await;
            let (alive, suspected) = rt.find_closest_with_status(&target, K);
            closest_nodes.extend(alive);
            for node in suspected {
                closest_nodes.push(node);
            }
        }

        for bootstrap in &self.bootstrap_nodes {
            if !queried.contains(&bootstrap.id) {
                closest_nodes.push(bootstrap.clone());
            }
        }

        closest_nodes.sort_by_key(|n| n.id.distance(&target));
        closest_nodes.truncate(K);

        let mut iterations = 0;
        let max_iterations = 10;

        while iterations < max_iterations && !closest_nodes.is_empty() {
            iterations += 1;

            let nodes_to_query: Vec<NodeInfo> = closest_nodes
                .iter()
                .filter(|n| !queried.contains(&n.id) && !failed_nodes.contains(&n.id))
                .take(ALPHA)
                .cloned()
                .collect();

            if nodes_to_query.is_empty() {
                break;
            }

            let mut tasks = Vec::new();
            for node in &nodes_to_query {
                queried.insert(node.id);

                let network = self.network.clone();
                let rtt_estimator = self.rtt_estimator.clone();
                let routing_table = self.routing_table.clone();
                let local_id = self.local_id;
                let node_clone = node.clone();

                let task = tokio::spawn(async move {
                    let msg_id = network.next_message_id().await;
                    let request = crate::rpc::RpcMessage::new_find_node(msg_id, local_id, target);

                    let timeout = rtt_estimator.lock().await.timeout();
                    let start = Instant::now();

                    match network.send_request(node_clone.addr, request, timeout).await {
                        Ok(response) => {
                            let rtt = start.elapsed();
                            rtt_estimator.lock().await.update(rtt);

                            let mut rt = routing_table.lock().await;
                            rt.record_node_success(node_clone.id, rtt);

                            if let crate::rpc::RpcBody::Response(crate::rpc::RpcResponse::FindNode { nodes }) = response.body {
                                Some((node_clone, nodes))
                            } else {
                                None
                            }
                        }
                        Err(_) => {
                            let mut rt = routing_table.lock().await;
                            match rt.record_node_failure(node_clone.id) {
                                FailureAction::Suspected(n) => {
                                    debug!("Node {:?} marked as suspected during find_node", n.id);
                                }
                                FailureAction::Removed(n) => {
                                    debug!("Node {:?} removed during find_node", n.id);
                                }
                                _ => {}
                            }
                            None
                        }
                    }
                });
                tasks.push(task);
            }

            let results = futures::future::join_all(tasks).await;
            let mut new_nodes = Vec::new();

            for result in results {
                if let Ok(Some((respondent, nodes))) = result {
                    responded_nodes.push(respondent);
                    for node in nodes {
                        if node.id != self.local_id {
                            if !closest_nodes.iter().any(|n| n.id == node.id) {
                                new_nodes.push(node.clone());
                            }

                            let mut rt = self.routing_table.lock().await;
                            if rt.get_node(&node.id).is_none() {
                                rt.add_replacement(node);
                            }
                        }
                    }
                }
            }

            for node in &nodes_to_query {
                if !responded_nodes.iter().any(|n| n.id == node.id) {
                    failed_nodes.insert(node.id);
                }
            }

            closest_nodes.retain(|n| !failed_nodes.contains(&n.id));
            for node in new_nodes {
                if !closest_nodes.iter().any(|n| n.id == node.id) {
                    closest_nodes.push(node);
                }
            }

            closest_nodes.sort_by_key(|n| n.id.distance(&target));
            closest_nodes.truncate(K);
        }

        {
            let mut rt = self.routing_table.lock().await;
            for node in responded_nodes {
                rt.insert(node);
            }
        }

        Ok(closest_nodes)
    }

    pub async fn find_value(&self, key: NodeId) -> Result<(Option<Vec<u8>>, Vec<NodeInfo>), DhtError> {
        if let Some(value) = self.storage.get(key) {
            return Ok((Some(value), Vec::new()));
        }

        if self.storage.has_origin_pointer(key) {
            if let Some(origin_peer) = self.storage.get_origin_peer(key) {
                debug!("Cold data hit, need to fetch from origin: {:?}", origin_peer);
            }
        }

        let mut queried = HashSet::new();
        let mut closest_nodes = Vec::new();
        let mut responded_nodes = Vec::new();
        let mut failed_nodes = HashSet::new();

        {
            let rt = self.routing_table.lock().await;
            let (alive, suspected) = rt.find_closest_with_status(&key, K);
            closest_nodes.extend(alive);
            for node in suspected {
                closest_nodes.push(node);
            }
        }

        closest_nodes.sort_by_key(|n| n.id.distance(&key));
        closest_nodes.truncate(K);

        let mut iterations = 0;
        let max_iterations = 10;

        while iterations < max_iterations && !closest_nodes.is_empty() {
            iterations += 1;

            let nodes_to_query: Vec<NodeInfo> = closest_nodes
                .iter()
                .filter(|n| !queried.contains(&n.id) && !failed_nodes.contains(&n.id))
                .take(ALPHA)
                .cloned()
                .collect();

            if nodes_to_query.is_empty() {
                break;
            }

            let mut tasks = Vec::new();
            for node in &nodes_to_query {
                queried.insert(node.id);

                let network = self.network.clone();
                let rtt_estimator = self.rtt_estimator.clone();
                let routing_table = self.routing_table.clone();
                let local_id = self.local_id;
                let node_clone = node.clone();

                let task = tokio::spawn(async move {
                    let msg_id = network.next_message_id().await;
                    let request = crate::rpc::RpcMessage::new_find_value(msg_id, local_id, key);

                    let timeout = rtt_estimator.lock().await.timeout();
                    let start = Instant::now();

                    match network.send_request(node_clone.addr, request, timeout).await {
                        Ok(response) => {
                            let rtt = start.elapsed();
                            rtt_estimator.lock().await.update(rtt);

                            let mut rt = routing_table.lock().await;
                            rt.record_node_success(node_clone.id, rtt);

                            if let crate::rpc::RpcBody::Response(crate::rpc::RpcResponse::FindValue { nodes, value }) = response.body {
                                Some((node_clone, nodes, value))
                            } else {
                                None
                            }
                        }
                        Err(_) => {
                            let mut rt = routing_table.lock().await;
                            rt.record_node_failure(node_clone.id);
                            None
                        }
                    }
                });
                tasks.push(task);
            }

            let results = futures::future::join_all(tasks).await;
            let mut new_nodes = Vec::new();

            for result in results {
                if let Ok(Some((respondent, nodes, value_opt))) = result {
                    responded_nodes.push(respondent);

                    if let Some(value) = value_opt {
                        let mut rt = self.routing_table.lock().await;
                        for node in responded_nodes {
                            rt.insert(node);
                        }
                        return Ok((Some(value), closest_nodes));
                    }

                    for node in nodes {
                        if node.id != self.local_id {
                            if !closest_nodes.iter().any(|n| n.id == node.id) {
                                new_nodes.push(node.clone());
                            }

                            let mut rt = self.routing_table.lock().await;
                            if rt.get_node(&node.id).is_none() {
                                rt.add_replacement(node);
                            }
                        }
                    }
                }
            }

            for node in &nodes_to_query {
                if !responded_nodes.iter().any(|n| n.id == node.id) {
                    failed_nodes.insert(node.id);
                }
            }

            closest_nodes.retain(|n| !failed_nodes.contains(&n.id));
            for node in new_nodes {
                if !closest_nodes.iter().any(|n| n.id == node.id) {
                    closest_nodes.push(node);
                }
            }

            closest_nodes.sort_by_key(|n| n.id.distance(&key));
            closest_nodes.truncate(K);
        }

        {
            let mut rt = self.routing_table.lock().await;
            for node in responded_nodes {
                rt.insert(node);
            }
        }

        Ok((None, closest_nodes))
    }

    pub async fn store(&self, key: NodeId, value: Vec<u8>) -> Result<usize, DhtError> {
        let replication_factor = self.storage.get_replication_factor(key);
        info!(
            "Storing key {:?} with replication factor: {}",
            key, replication_factor
        );

        let closest_nodes = self.find_node(key).await?;

        if closest_nodes.is_empty() {
            self.storage.store(key, value);
            return Ok(1);
        }

        let nodes_to_store: Vec<NodeInfo> = closest_nodes
            .into_iter()
            .filter(|n| n.id != self.local_id)
            .take(replication_factor)
            .collect();

        let mut tasks = Vec::new();
        let value_clone = value.clone();

        for (i, node) in nodes_to_store.iter().enumerate() {
            let network = self.network.clone();
            let rtt_estimator = self.rtt_estimator.clone();
            let routing_table = self.routing_table.clone();
            let local_id = self.local_id;
            let node_clone = node.clone();
            let value_clone = value_clone.clone();
            let replica_manager = self.replica_manager.clone();

            let task = tokio::spawn(async move {
                let msg_id = network.next_message_id().await;
                let request = crate::rpc::RpcMessage::new_store(msg_id, local_id, key, value_clone);

                let timeout = rtt_estimator.lock().await.timeout();
                let start = Instant::now();

                match network.send_request(node_clone.addr, request, timeout).await {
                    Ok(_) => {
                        let rtt = start.elapsed();
                        let mut rt = routing_table.lock().await;
                        rt.record_node_success(node_clone.id, rtt);

                        let distance = key.distance(&node_clone.id).leading_zeros();
                        replica_manager.add_replica(key, node_clone.id, distance);
                        Some(node_clone)
                    }
                    Err(_) => {
                        let mut rt = routing_table.lock().await;
                        rt.record_node_failure(node_clone.id);
                        None
                    }
                }
            });
            tasks.push(task);
        }

        let results = futures::future::join_all(tasks).await;
        let mut success_count = 0;

        for result in results {
            if let Ok(Some(_)) = result {
                success_count += 1;
            }
        }

        self.storage.store(key, value);
        success_count += 1;

        let hotness = self.storage.get_hotness(key);
        info!(
            "Stored key {:?} on {} nodes, hotness: {:?}",
            key, success_count, hotness
        );
        Ok(success_count)
    }

    pub async fn store_cold_data_pointer(&self, key: NodeId, origin_peer: NodeId) -> Result<(), DhtError> {
        self.storage.store_with_origin_pointer(key, origin_peer);
        info!("Stored origin pointer for key {:?}", key);
        Ok(())
    }

    pub async fn handle_request(
        &self,
        request: crate::rpc::RpcMessage,
        sender_addr: SocketAddr,
    ) -> Result<(), DhtError> {
        let sender_id = request.sender;
        let msg_id = request.id;

        {
            let mut rt = self.routing_table.lock().await;
            rt.insert(NodeInfo::new(sender_id, sender_addr));
        }

        let response = match request.body {
            crate::rpc::RpcBody::Request(req) => match req {
                crate::rpc::RpcRequest::Ping => {
                    crate::rpc::RpcMessage::new_pong(msg_id, self.local_id)
                }
                crate::rpc::RpcRequest::FindNode { target } => {
                    let rt = self.routing_table.lock().await;
                    let nodes = rt.get_k_closest(&target);
                    crate::rpc::RpcMessage::new_find_node_response(msg_id, self.local_id, nodes)
                }
                crate::rpc::RpcRequest::FindValue { key } => {
                    let value = self.storage.get(key);
                    let rt = self.routing_table.lock().await;
                    let nodes = if value.is_none() {
                        rt.get_k_closest(&key)
                    } else {
                        Vec::new()
                    };
                    crate::rpc::RpcMessage::new_find_value_response(msg_id, self.local_id, nodes, value)
                }
                crate::rpc::RpcRequest::Store { key, value } => {
                    self.storage.store(key, value);
                    crate::rpc::RpcMessage::new_store_ack(msg_id, self.local_id)
                }
            },
            _ => {
                warn!("Received unexpected response from {}", sender_addr);
                return Ok(());
            }
        };

        self.network.send_response(sender_addr, response).await?;
        Ok(())
    }

    pub async fn migrate_replicas(&self) -> Result<(usize, usize), DhtError> {
        let keys = self.storage.get_keys_for_migration();
        let mut added = 0;
        let mut removed = 0;

        info!("Starting replica migration for {} keys...", keys.len());

        for (key, hotness, current, target) in keys {
            if self.replica_manager.has_pending_migration(key) {
                continue;
            }

            if current < target {
                let needed = target - current;
                match self.add_replicas(key, needed).await {
                    Ok(n) => added += n,
                    Err(e) => warn!("Failed to add replicas for {:?}: {}", key, e),
                }
            } else if current > target {
                let excess = current - target;
                match self.remove_excess_replicas(key, excess).await {
                    Ok(n) => removed += n,
                    Err(e) => warn!("Failed to remove replicas for {:?}: {}", key, e),
                }
            }

            if hotness == HotnessLevel::Hot {
                match self.optimize_hot_data_location(key).await {
                    Ok(n) => added += n,
                    Err(e) => warn!("Failed to optimize hot data location for {:?}: {}", key, e),
                }
            }
        }

        self.replica_manager.cleanup_completed_migrations();

        info!(
            "Replica migration completed: added {}, removed {}",
            added, removed
        );
        Ok((added, removed))
    }

    async fn add_replicas(&self, key: NodeId, count: usize) -> Result<usize, DhtError> {
        let closest_nodes = self.find_node(key).await?;
        let current_replicas = self.replica_manager.get_replicas(key);
        let current_locations: HashSet<_> = current_replicas.iter().map(|r| r.location).collect();

        let nodes_to_add: Vec<_> = closest_nodes
            .into_iter()
            .filter(|n| n.id != self.local_id && !current_locations.contains(&n.id))
            .take(count)
            .collect();

        if nodes_to_add.is_empty() {
            return Ok(0);
        }

        let value = match self.storage.get(key) {
            Some(v) => v,
            None => return Ok(0),
        };

        let mut tasks = Vec::new();

        for node in nodes_to_add {
            if !self.replica_manager.start_migration(key, None, node.id) {
                continue;
            }

            let network = self.network.clone();
            let rtt_estimator = self.rtt_estimator.clone();
            let routing_table = self.routing_table.clone();
            let replica_manager = self.replica_manager.clone();
            let local_id = self.local_id;
            let node_clone = node.clone();
            let value_clone = value.clone();

            let task = tokio::spawn(async move {
                let msg_id = network.next_message_id().await;
                let request = crate::rpc::RpcMessage::new_store(msg_id, local_id, key, value_clone);
                let timeout = rtt_estimator.lock().await.timeout();
                let start = Instant::now();

                let success = match network.send_request(node_clone.addr, request, timeout).await {
                    Ok(_) => {
                        let rtt = start.elapsed();
                        let mut rt = routing_table.lock().await;
                        rt.record_node_success(node_clone.id, rtt);
                        let distance = key.distance(&node_clone.id).leading_zeros();
                        replica_manager.add_replica(key, node_clone.id, distance);
                        true
                    }
                    Err(_) => {
                        let mut rt = routing_table.lock().await;
                        rt.record_node_failure(node_clone.id);
                        false
                    }
                };

                replica_manager.complete_migration(key, success);
                success
            });
            tasks.push(task);
        }

        let results = futures::future::join_all(tasks).await;
        let success_count = results.iter().filter(|r| matches!(r, Ok(true))).count();

        Ok(success_count)
    }

    async fn remove_excess_replicas(&self, key: NodeId, count: usize) -> Result<usize, DhtError> {
        let mut replicas = self.replica_manager.get_replicas(key);
        replicas.sort_by_key(|r| std::cmp::Reverse(r.distance));

        let mut removed = 0;
        for replica in replicas.iter().take(count) {
            self.replica_manager.remove_replica(key, replica.location);
            removed += 1;
        }

        Ok(removed)
    }

    async fn optimize_hot_data_location(&self, key: NodeId) -> Result<usize, DhtError> {
        let closest_nodes = self.find_node(key).await?;
        let current_replicas = self.replica_manager.get_replicas(key);
        let current_locations: HashSet<_> = current_replicas.iter().map(|r| r.location).collect();

        let target_count = HotnessLevel::Hot.replication_factor();
        let mut better_locations = Vec::new();

        for node in closest_nodes {
            if node.id == self.local_id {
                continue;
            }
            if !current_locations.contains(&node.id) {
                let distance = key.distance(&node.id).leading_zeros();
                better_locations.push((node, distance));
            }
        }

        better_locations.sort_by_key(|(_, d)| *d);

        let value = match self.storage.get(key) {
            Some(v) => v,
            None => return Ok(0),
        };

        let mut added = 0;
        for (node, distance) in better_locations.iter().take(target_count) {
            if self.replica_manager.has_pending_migration(key) {
                continue;
            }

            if !self.replica_manager.start_migration(key, None, node.id) {
                continue;
            }

            let msg_id = self.network.next_message_id().await;
            let request = crate::rpc::RpcMessage::new_store(msg_id, self.local_id, key, value.clone());
            let timeout = self.rtt_estimator.lock().await.timeout();

            match self.network.send_request(node.addr, request, timeout).await {
                Ok(_) => {
                    self.replica_manager.add_replica(key, node.id, *distance);
                    self.replica_manager.complete_migration(key, true);
                    added += 1;
                }
                Err(_) => {
                    self.replica_manager.complete_migration(key, false);
                }
            }
        }

        if added > 0 {
            debug!("Optimized hot data {:?}: added {} closer replicas", key, added);
        }

        Ok(added)
    }

    pub async fn republish_data(&self) -> Result<usize, DhtError> {
        let keys = self.storage.get_keys_needing_republish();
        let mut republished = 0;

        for key in keys {
            if let Some(value) = self.storage.get(key) {
                match self.store(key, value).await {
                    Ok(_) => {
                        self.storage.update_republished(key);
                        republished += 1;
                    }
                    Err(e) => {
                        warn!("Failed to republish key {:?}: {}", key, e);
                    }
                }
            }
        }

        if republished > 0 {
            info!("Republished {} keys", republished);
        }

        Ok(republished)
    }

    pub async fn cleanup_routing_table(&self) -> usize {
        let mut rt = self.routing_table.lock().await;
        let removed = rt.cleanup_stale();
        if !removed.is_empty() {
            debug!("Removed {} stale nodes from routing table", removed.len());
        }

        let offline_removed = rt.cleanup_offline();
        if !offline_removed.is_empty() {
            debug!("Removed {} offline nodes from routing table", offline_removed.len());
        }

        removed.len() + offline_removed.len()
    }

    pub async fn get_routing_table_stats(&self) -> RoutingTableStats {
        let rt = self.routing_table.lock().await;
        rt.get_stats()
    }

    pub fn storage(&self) -> Arc<Storage> {
        self.storage.clone()
    }

    pub fn routing_table(&self) -> Arc<Mutex<RoutingTable>> {
        self.routing_table.clone()
    }

    pub fn local_id(&self) -> NodeId {
        self.local_id
    }

    pub fn network(&self) -> Arc<Network> {
        self.network.clone()
    }

    pub fn hotness_tracker(&self) -> Arc<HotnessTracker> {
        self.hotness_tracker.clone()
    }

    pub fn replica_manager(&self) -> Arc<ReplicaManager> {
        self.replica_manager.clone()
    }
}

#[derive(thiserror::Error, Debug)]
pub enum DhtError {
    #[error("Network error: {0}")]
    Network(#[from] NetworkError),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Certificate error: {0}")]
    CertError(String),
    #[error("No nodes found")]
    NoNodesFound,
}

impl From<Box<dyn std::error::Error>> for DhtError {
    fn from(e: Box<dyn std::error::Error>) -> Self {
        DhtError::CertError(e.to_string())
    }
}

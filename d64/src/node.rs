use crate::id::NodeId;
use crate::routing_table::{RoutingTable, NodeInfo, NodeStatus, K, UpdateResult, FailureAction, PROBE_PARALLELISM};
use crate::network::{QuicNetwork, NetworkConfig, generate_self_signed_cert};
use crate::rpc::*;
use crate::storage::{DataStorage, REPUBLISH_INTERVAL};
use std::error::Error;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use tokio::time::interval;
use tracing::*;
use futures::future::join_all;
use bincode;
use dashmap::DashSet;

pub const HEALTH_CHECK_INTERVAL: Duration = Duration::from_secs(60);
pub const LIVENESS_TIMEOUT: Duration = Duration::from_secs(5);

pub struct KademliaNode {
    id: NodeId,
    address: SocketAddr,
    routing_table: RwLock<RoutingTable>,
    storage: Arc<DataStorage>,
    network: RwLock<QuicNetwork>,
    rpc_context: RwLock<RpcContext>,
    bootstrap_nodes: Vec<SocketAddr>,
}

impl KademliaNode {
    pub async fn new(bind_addr: SocketAddr, bootstrap_nodes: Vec<SocketAddr>) -> Result<Self, Box<dyn Error>> {
        let id = NodeId::new();
        let (cert_chain, key) = generate_self_signed_cert()?;
        let network_config = NetworkConfig::new(bind_addr, cert_chain, key);
        
        let network = QuicNetwork::new(id, network_config).await?;
        let actual_addr = network.local_addr()?;
        
        info!("Node {} started on {}", id, actual_addr);
        
        Ok(KademliaNode {
            id,
            address: actual_addr,
            routing_table: RwLock::new(RoutingTable::new(id)),
            storage: Arc::new(DataStorage::new()),
            network: RwLock::new(network),
            rpc_context: RwLock::new(RpcContext::new(id, actual_addr)),
            bootstrap_nodes,
        })
    }
    
    pub fn id(&self) -> NodeId {
        self.id
    }
    
    pub fn address(&self) -> SocketAddr {
        self.address
    }
    
    pub async fn bootstrap(&self) -> Result<(), Box<dyn Error>> {
        info!("Bootstrapping node {}...", self.id);
        
        for &bootstrap_addr in &self.bootstrap_nodes {
            info!("Connecting to bootstrap node: {}", bootstrap_addr);
            
            if let Err(e) = self.ping(bootstrap_addr).await {
                warn!("Failed to ping bootstrap node {}: {}", bootstrap_addr, e);
                continue;
            }
            
            if let Err(e) = self.find_node(self.id).await {
                warn!("Failed to find_node during bootstrap: {}", e);
            }
        }
        
        Ok(())
    }
    
    pub async fn ping(&self, addr: SocketAddr) -> Result<Duration, Box<dyn Error>> {
        let start = Instant::now();
        
        let request = {
            let mut ctx = self.rpc_context.write().await;
            ctx.create_request(RequestBody::Ping)
        };
        
        let message = RpcMessage::Request(request.clone());
        let response_bytes = self.network.write().await.send_message(addr, &bincode::serialize(&message)?).await?;
        let response: RpcMessage = bincode::deserialize(&response_bytes)?;
        
        let rtt = start.elapsed();
        
        if let RpcMessage::Response(resp) = response {
            match resp.body {
                ResponseBody::Pong => {
                    let node_info = NodeInfo::new(resp.sender_id, resp.sender_addr);
                    self.routing_table.write().await.update(node_info);
                    Ok(rtt)
                }
                _ => Err("Unexpected response type".into()),
            }
        } else {
            Err("Expected response".into())
        }
    }
    
    pub async fn find_node(&self, target: NodeId) -> Result<Vec<NodeInfo>, Box<dyn Error>> {
        debug!("Finding nodes close to: {}", target);
        
        let closest_nodes = self.routing_table.read().await.get_k_closest_nodes(&target);
        
        if closest_nodes.is_empty() && self.bootstrap_nodes.is_empty() {
            return Ok(Vec::new());
        }
        
        let nodes_to_query = if closest_nodes.is_empty() {
            self.bootstrap_nodes.clone()
        } else {
            closest_nodes.iter().map(|n| n.address).take(ALPHA).collect()
        };
        
        let mut results = Vec::new();
        
        for addr in nodes_to_query {
            let request = {
                let mut ctx = self.rpc_context.write().await;
                ctx.create_request(RequestBody::FindNode { target })
            };
            
            let message = RpcMessage::Request(request);
            
            match self.network.write().await.send_message(addr, &bincode::serialize(&message)?).await {
                Ok(response_bytes) => {
                    if let Ok(RpcMessage::Response(resp)) = bincode::deserialize(&response_bytes) {
                        if let ResponseBody::FindNodeResult { nodes } = resp.body {
                            let mut rt = self.routing_table.write().await;
                            for node in &nodes {
                                rt.update(node.clone());
                            }
                            results.extend(nodes);
                        }
                    }
                }
                Err(e) => {
                    debug!("Failed to query node {}: {}", addr, e);
                }
            }
        }
        
        results.sort_by_key(|n| n.id.distance(&target));
        results.dedup_by_key(|n| n.id);
        results.truncate(K);
        
        Ok(results)
    }
    
    pub async fn store(&self, key: NodeId, value: Vec<u8>) -> Result<usize, Box<dyn Error>> {
        info!("Storing value with key: {}", key);
        
        let closest_nodes = self.find_node(key).await?;
        let mut success_count = 0;
        
        for node in &closest_nodes {
            let request = {
                let mut ctx = self.rpc_context.write().await;
                ctx.create_request(RequestBody::Store {
                    key,
                    value: value.clone(),
                })
            };
            
            let message = RpcMessage::Request(request);
            
            match self.network.write().await.send_message(node.address, &bincode::serialize(&message)?).await {
                Ok(response_bytes) => {
                    if let Ok(RpcMessage::Response(resp)) = bincode::deserialize(&response_bytes) {
                        if let ResponseBody::StoreResult { success } = resp.body {
                            if success {
                                success_count += 1;
                            }
                        }
                    }
                }
                Err(e) => {
                    debug!("Failed to store on node {}: {}", node.address, e);
                }
            }
        }
        
        self.storage.store(key, value, self.id);
        success_count += 1;
        
        info!("Stored value on {} nodes", success_count);
        Ok(success_count)
    }
    
    pub async fn find_value(&self, key: NodeId) -> Result<Option<Vec<u8>>, Box<dyn Error>> {
        debug!("Finding value for key: {}", key);
        
        if let Some(value) = self.storage.get(&key) {
            return Ok(Some(value));
        }
        
        let closest_nodes = self.routing_table.read().await.get_k_closest_nodes(&key);
        
        for node in closest_nodes.iter().take(ALPHA) {
            let request = {
                let mut ctx = self.rpc_context.write().await;
                ctx.create_request(RequestBody::FindValue { key })
            };
            
            let message = RpcMessage::Request(request);
            
            match self.network.write().await.send_message(node.address, &bincode::serialize(&message)?).await {
                Ok(response_bytes) => {
                    if let Ok(RpcMessage::Response(resp)) = bincode::deserialize(&response_bytes) {
                        if let ResponseBody::FindValueResult { value, nodes } = resp.body {
                            if let Some(value) = value {
                                return Ok(Some(value));
                            }
                            
                            let mut rt = self.routing_table.write().await;
                            for n in nodes {
                                rt.update(n);
                            }
                        }
                    }
                }
                Err(e) => {
                    debug!("Failed to query node {}: {}", node.address, e);
                }
            }
        }
        
        Ok(None)
    }
    
    pub async fn handle_request(&self, request: Request, peer_addr: SocketAddr) -> Result<ResponseBody, Box<dyn Error>> {
        let mut node_info = NodeInfo::new(request.sender_id, request.sender_addr);
        node_info.update_last_seen();
        
        self.routing_table.write().await.update(node_info);
        
        match request.body {
            RequestBody::Ping => {
                debug!("Received PING from {}", request.sender_id);
                Ok(ResponseBody::Pong)
            }
            RequestBody::FindNode { target } => {
                debug!("Received FIND_NODE for {} from {}", target, request.sender_id);
                let closest = self.routing_table.read().await.get_k_closest_nodes(&target);
                Ok(ResponseBody::FindNodeResult { nodes: closest })
            }
            RequestBody::FindValue { key } => {
                debug!("Received FIND_VALUE for {} from {}", key, request.sender_id);
                let value = self.storage.get(&key);
                let nodes = if value.is_none() {
                    self.routing_table.read().await.get_k_closest_nodes(&key)
                } else {
                    Vec::new()
                };
                Ok(ResponseBody::FindValueResult { value, nodes })
            }
            RequestBody::Store { key, value } => {
                debug!("Received STORE for {} from {}", key, request.sender_id);
                self.storage.store(key, value, request.sender_id);
                Ok(ResponseBody::StoreResult { success: true })
            }
        }
    }
    
    pub async fn run(&self) -> Result<(), Box<dyn Error>> {
        info!("Node {} running on {}", self.id, self.address);
        
        let republish_storage = self.storage.clone();
        let republish_id = self.id;
        
        let republish_task = tokio::spawn(async move {
            let mut timer = interval(REPUBLISH_INTERVAL);
            loop {
                timer.tick().await;
                let removed = republish_storage.cleanup_expired();
                if removed > 0 {
                    debug!("Cleaned up {} expired entries", removed);
                }
            }
        });
        
        let mut network = self.network.write().await;
        
        loop {
            match network.receive_message().await {
                Ok((peer_addr, message_bytes)) => {
                    match bincode::deserialize::<RpcMessage>(&message_bytes) {
                        Ok(RpcMessage::Request(request)) => {
                            let response_body = match self.handle_request(request.clone(), peer_addr).await {
                                Ok(body) => body,
                                Err(e) => {
                                    warn!("Error handling request: {}", e);
                                    continue;
                                }
                            };
                            
                            let response = {
                                let ctx = self.rpc_context.read().await;
                                ctx.create_response(&request, response_body)
                            };
                            
                            let response_message = RpcMessage::Response(response);
                            if let Ok(response_bytes) = bincode::serialize(&response_message) {
                                let _ = network.send_message(peer_addr, &response_bytes).await;
                            }
                        }
                        _ => {
                            debug!("Received unexpected message type from {}", peer_addr);
                        }
                    }
                }
                Err(e) => {
                    warn!("Error receiving message: {}", e);
                }
            }
        }
    }
}

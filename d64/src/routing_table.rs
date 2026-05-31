use crate::id::{NodeId, Distance};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::time::{Duration, Instant};
use std::net::SocketAddr;

pub const K: usize = 20;
pub const NODE_TIMEOUT: Duration = Duration::from_secs(3 * 3600);
pub const MAX_CONSECUTIVE_FAILURES: u32 = 3;
pub const PROBE_PARALLELISM: usize = 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum NodeStatus {
    Alive,
    Suspected,
    Offline,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeInfo {
    pub id: NodeId,
    pub address: SocketAddr,
    last_seen: Instant,
    pub rtt: Option<Duration>,
    consecutive_failures: u32,
    pub status: NodeStatus,
    last_probed: Option<Instant>,
}

impl NodeInfo {
    pub fn new(id: NodeId, address: SocketAddr) -> Self {
        NodeInfo {
            id,
            address,
            last_seen: Instant::now(),
            rtt: None,
            consecutive_failures: 0,
            status: NodeStatus::Alive,
            last_probed: None,
        }
    }
    
    pub fn address(&self) -> SocketAddr {
        self.address
    }
    
    pub fn update_last_seen(&mut self) {
        self.last_seen = Instant::now();
        self.consecutive_failures = 0;
        self.status = NodeStatus::Alive;
    }
    
    pub fn is_alive(&self) -> bool {
        self.status == NodeStatus::Alive && self.last_seen.elapsed() < NODE_TIMEOUT
    }
    
    pub fn is_suspected(&self) -> bool {
        self.status == NodeStatus::Suspected
    }
    
    pub fn is_offline(&self) -> bool {
        self.status == NodeStatus::Offline
    }
    
    pub fn record_success(&mut self, rtt: Duration) {
        self.rtt = Some(rtt);
        self.update_last_seen();
    }
    
    pub fn record_failure(&mut self) -> bool {
        self.consecutive_failures += 1;
        if self.consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
            self.status = NodeStatus::Suspected;
            true
        } else {
            false
        }
    }
    
    pub fn mark_offline(&mut self) {
        self.status = NodeStatus::Offline;
    }
    
    pub fn mark_alive(&mut self) {
        self.status = NodeStatus::Alive;
        self.consecutive_failures = 0;
    }
    
    pub fn update_rtt(&mut self, rtt: Duration) {
        self.rtt = Some(rtt);
    }
    
    pub fn consecutive_failures(&self) -> u32 {
        self.consecutive_failures
    }
    
    pub fn needs_probe(&self) -> bool {
        if self.status == NodeStatus::Suspected {
            if let Some(last_probed) = self.last_probed {
                last_probed.elapsed() > Duration::from_secs(60)
            } else {
                true
            }
        } else {
            false
        }
    }
    
    pub fn update_probe_time(&mut self) {
        self.last_probed = Some(Instant::now());
    }
}

pub struct KBucket {
    nodes: VecDeque<NodeInfo>,
    backup_nodes: VecDeque<NodeInfo>,
    last_updated: Instant,
}

impl KBucket {
    pub fn new() -> Self {
        KBucket {
            nodes: VecDeque::with_capacity(K),
            backup_nodes: VecDeque::with_capacity(K),
            last_updated: Instant::now(),
        }
    }
    
    pub fn len(&self) -> usize {
        self.nodes.len()
    }
    
    pub fn is_empty(&self) -> bool {
        self.nodes.is_empty()
    }
    
    pub fn is_full(&self) -> bool {
        self.nodes.len() >= K
    }
    
    pub fn update(&mut self, node: NodeInfo) -> UpdateResult {
        if node.is_offline() {
            return UpdateResult::Skipped;
        }
        
        if let Some(pos) = self.nodes.iter().position(|n| n.id == node.id) {
            let mut existing = self.nodes.remove(pos).unwrap();
            existing.update_last_seen();
            if let Some(rtt) = node.rtt {
                existing.update_rtt(rtt);
            }
            self.nodes.push_back(existing);
            self.last_updated = Instant::now();
            UpdateResult::Updated
        } else if self.is_full() {
            if !self.backup_nodes.iter().any(|n| n.id == node.id) {
                self.backup_nodes.push_back(node);
                if self.backup_nodes.len() > K {
                    self.backup_nodes.pop_front();
                }
            }
            UpdateResult::Full(self.nodes.front().unwrap().clone())
        } else {
            self.nodes.push_back(node);
            self.last_updated = Instant::now();
            UpdateResult::Added
        }
    }
    
    pub fn remove(&mut self, id: &NodeId) -> Option<NodeInfo> {
        if let Some(pos) = self.nodes.iter().position(|n| n.id == *id) {
            let removed = self.nodes.remove(pos);
            self.try_promote_backup();
            self.last_updated = Instant::now();
            removed
        } else {
            self.backup_nodes.retain(|n| n.id != *id);
            None
        }
    }
    
    fn try_promote_backup(&mut self) {
        while self.nodes.len() < K && !self.backup_nodes.is_empty() {
            if let Some(backup) = self.backup_nodes.pop_front() {
                if backup.is_alive() {
                    self.nodes.push_back(backup);
                }
            }
        }
    }
    
    pub fn record_node_failure(&mut self, id: &NodeId) -> FailureAction {
        if let Some(pos) = self.nodes.iter().position(|n| n.id == *id) {
            let node = &mut self.nodes[pos];
            if node.record_failure() {
                FailureAction::NeedsProbe
            } else {
                FailureAction::FailureCounted
            }
        } else {
            FailureAction::NodeNotFound
        }
    }
    
    pub fn mark_node_offline(&mut self, id: &NodeId) -> Option<NodeInfo> {
        let result = self.remove(id);
        if result.is_some() {
            self.try_promote_backup();
        }
        result
    }
    
    pub fn get_suspected_nodes(&self) -> Vec<NodeId> {
        self.nodes
            .iter()
            .filter(|n| n.is_suspected())
            .map(|n| n.id)
            .collect()
    }
    
    pub fn get(&self, id: &NodeId) -> Option<&NodeInfo> {
        self.nodes.iter().find(|n| n.id == *id)
    }
    
    pub fn get_mut(&mut self, id: &NodeId) -> Option<&mut NodeInfo> {
        self.nodes.iter_mut().find(|n| n.id == *id)
    }
    
    pub fn contains(&self, id: &NodeId) -> bool {
        self.nodes.iter().any(|n| n.id == *id)
    }
    
    pub fn nodes(&self) -> impl Iterator<Item = &NodeInfo> {
        self.nodes.iter()
    }
    
    pub fn alive_nodes(&self) -> Vec<NodeInfo> {
        self.nodes.iter().filter(|n| n.is_alive()).cloned().collect()
    }
    
    pub fn all_nodes(&self) -> Vec<NodeInfo> {
        self.nodes.iter().cloned().collect()
    }
    
    pub fn backup_nodes(&self) -> Vec<NodeInfo> {
        self.backup_nodes.iter().cloned().collect()
    }
    
    pub fn oldest_node(&self) -> Option<&NodeInfo> {
        self.nodes.front()
    }
    
    pub fn least_recently_seen(&mut self) -> Option<NodeInfo> {
        self.nodes.pop_front()
    }
    
    pub fn cleanup_offline_nodes(&mut self) -> usize {
        let original_len = self.nodes.len();
        self.nodes.retain(|n| !n.is_offline());
        self.backup_nodes.retain(|n| !n.is_offline());
        let removed = original_len - self.nodes.len();
        if removed > 0 {
            self.try_promote_backup();
        }
        removed
    }
}

pub enum UpdateResult {
    Updated,
    Added,
    Full(NodeInfo),
    Skipped,
}

pub enum FailureAction {
    FailureCounted,
    NeedsProbe,
    NodeNotFound,
}

pub struct RoutingTable {
    local_id: NodeId,
    buckets: Vec<KBucket>,
}

impl RoutingTable {
    pub fn new(local_id: NodeId) -> Self {
        let mut buckets = Vec::with_capacity(160);
        for _ in 0..160 {
            buckets.push(KBucket::new());
        }
        RoutingTable { local_id, buckets }
    }
    
    pub fn local_id(&self) -> NodeId {
        self.local_id
    }
    
    pub fn bucket_index(&self, id: &NodeId) -> usize {
        self.local_id.bucket_index(id).min(159)
    }
    
    pub fn update(&mut self, node: NodeInfo) -> UpdateResult {
        let index = self.bucket_index(&node.id);
        self.buckets[index].update(node)
    }
    
    pub fn remove(&mut self, id: &NodeId) -> Option<NodeInfo> {
        let index = self.bucket_index(id);
        self.buckets[index].remove(id)
    }
    
    pub fn record_failure(&mut self, id: &NodeId) -> FailureAction {
        let index = self.bucket_index(id);
        self.buckets[index].record_node_failure(id)
    }
    
    pub fn mark_offline(&mut self, id: &NodeId) -> Option<NodeInfo> {
        let index = self.bucket_index(id);
        self.buckets[index].mark_node_offline(id)
    }
    
    pub fn get_node_mut(&mut self, id: &NodeId) -> Option<&mut NodeInfo> {
        let index = self.bucket_index(id);
        self.buckets[index].get_mut(id)
    }
    
    pub fn find_closest(&self, target: &NodeId, count: usize) -> Vec<NodeInfo> {
        let mut all_nodes = Vec::new();
        for bucket in &self.buckets {
            all_nodes.extend(bucket.alive_nodes());
        }
        all_nodes.sort_by_key(|n| n.id.distance(target));
        all_nodes.truncate(count);
        all_nodes
    }
    
    pub fn get_k_closest_nodes(&self, target: &NodeId) -> Vec<NodeInfo> {
        self.find_closest(target, K)
    }
    
    pub fn get_node(&self, id: &NodeId) -> Option<&NodeInfo> {
        let index = self.bucket_index(id);
        self.buckets[index].get(id)
    }
    
    pub fn contains(&self, id: &NodeId) -> bool {
        let index = self.bucket_index(id);
        self.buckets[index].contains(id)
    }
    
    pub fn all_nodes(&self) -> Vec<NodeInfo> {
        let mut nodes = Vec::new();
        for bucket in &self.buckets {
            nodes.extend(bucket.all_nodes());
        }
        nodes
    }
    
    pub fn alive_nodes(&self) -> Vec<NodeInfo> {
        let mut nodes = Vec::new();
        for bucket in &self.buckets {
            nodes.extend(bucket.alive_nodes());
        }
        nodes
    }
    
    pub fn get_suspected_nodes(&self) -> Vec<NodeId> {
        let mut suspected = Vec::new();
        for bucket in &self.buckets {
            suspected.extend(bucket.get_suspected_nodes());
        }
        suspected
    }
    
    pub fn bucket_count(&self) -> usize {
        self.buckets.len()
    }
    
    pub fn node_count(&self) -> usize {
        self.buckets.iter().map(|b| b.len()).sum()
    }
    
    pub fn alive_node_count(&self) -> usize {
        self.buckets.iter().map(|b| b.alive_nodes().len()).sum()
    }
    
    pub fn cleanup_offline_nodes(&mut self) -> usize {
        let mut total_removed = 0;
        for bucket in &mut self.buckets {
            total_removed += bucket.cleanup_offline_nodes();
        }
        total_removed
    }
}

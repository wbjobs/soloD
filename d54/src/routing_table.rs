use crate::kbucket::{BucketStats, FailureAction, KBucket, K, BUCKET_COUNT};
use crate::node_id::{Distance, NodeId, NodeInfo};
use std::collections::HashMap;

pub struct RoutingTable {
    local_id: NodeId,
    buckets: Vec<KBucket>,
    recent_failures: HashMap<NodeId, u32>,
}

impl RoutingTable {
    pub fn new(local_id: NodeId) -> Self {
        let mut buckets = Vec::with_capacity(BUCKET_COUNT);
        for _ in 0..BUCKET_COUNT {
            buckets.push(KBucket::new());
        }
        Self {
            local_id,
            buckets,
            recent_failures: HashMap::new(),
        }
    }

    pub fn insert(&mut self, node: NodeInfo) {
        let bucket_index = self.local_id.bucket_index(&node.id);
        self.buckets[bucket_index].insert(node);
    }

    pub fn add_replacement(&mut self, node: NodeInfo) {
        let bucket_index = self.local_id.bucket_index(&node.id);
        self.buckets[bucket_index].add_to_replacement(node);
    }

    pub fn remove(&mut self, node_id: &NodeId) -> Option<NodeInfo> {
        let bucket_index = self.local_id.bucket_index(node_id);
        self.buckets[bucket_index].remove(node_id)
    }

    pub fn record_node_success(&mut self, node_id: NodeId, rtt: std::time::Duration) {
        let bucket_index = self.local_id.bucket_index(&node_id);
        self.buckets[bucket_index].mark_node_success(&node_id, rtt);
        self.recent_failures.remove(&node_id);
    }

    pub fn record_node_failure(&mut self, node_id: NodeId) -> FailureAction {
        let bucket_index = self.local_id.bucket_index(&node_id);
        let action = self.buckets[bucket_index].mark_node_failed(&node_id);
        
        match &action {
            FailureAction::Removed(_) => {
                self.recent_failures.remove(&node_id);
            }
            FailureAction::Suspected(_) => {
                self.recent_failures.insert(node_id, 0);
            }
            _ => {}
        }
        
        action
    }

    pub fn get_suspected_nodes(&self) -> Vec<NodeInfo> {
        let mut suspected = Vec::new();
        for bucket in &self.buckets {
            suspected.extend(bucket.get_suspected_nodes());
        }
        suspected
    }

    pub fn find_closest(&self, target: &NodeId, count: usize) -> Vec<NodeInfo> {
        let mut nodes = Vec::new();
        for bucket in &self.buckets {
            nodes.extend(bucket.get_alive_nodes(K));
        }

        nodes.sort_by_key(|n| n.id.distance(target));
        nodes.truncate(count);
        nodes
    }

    pub fn find_closest_with_status(&self, target: &NodeId, count: usize) -> (Vec<NodeInfo>, Vec<NodeInfo>) {
        let mut alive_nodes = Vec::new();
        let mut suspected_nodes = Vec::new();
        
        for bucket in &self.buckets {
            alive_nodes.extend(bucket.get_alive_nodes(K));
            suspected_nodes.extend(bucket.get_suspected_nodes());
        }

        alive_nodes.sort_by_key(|n| n.id.distance(target));
        alive_nodes.truncate(count);
        
        suspected_nodes.sort_by_key(|n| n.id.distance(target));
        
        (alive_nodes, suspected_nodes)
    }

    pub fn get_k_closest(&self, target: &NodeId) -> Vec<NodeInfo> {
        self.find_closest(target, K)
    }

    pub fn get_node(&self, node_id: &NodeId) -> Option<&NodeInfo> {
        let bucket_index = self.local_id.bucket_index(node_id);
        self.buckets[bucket_index].get(node_id)
    }

    pub fn get_random_nodes(&self, count: usize) -> Vec<NodeInfo> {
        let mut all_nodes = Vec::new();
        for bucket in &self.buckets {
            all_nodes.extend(bucket.get_all_nodes());
        }
        
        use rand::seq::SliceRandom;
        let mut rng = rand::thread_rng();
        all_nodes.shuffle(&mut rng);
        all_nodes.truncate(count);
        all_nodes
    }

    pub fn total_nodes(&self) -> usize {
        self.buckets.iter().map(|b| b.len()).sum()
    }

    pub fn cleanup_stale(&mut self) -> Vec<NodeInfo> {
        let mut removed = Vec::new();
        for bucket in &mut self.buckets {
            removed.extend(bucket.cleanup_stale());
        }
        removed
    }

    pub fn cleanup_offline(&mut self) -> Vec<NodeInfo> {
        let mut removed = Vec::new();
        for bucket in &mut self.buckets {
            removed.extend(bucket.cleanup_offline());
        }
        removed
    }

    pub fn local_id(&self) -> NodeId {
        self.local_id
    }

    pub fn get_bucket_nodes(&self, bucket_index: usize) -> Vec<NodeInfo> {
        if bucket_index < BUCKET_COUNT {
            self.buckets[bucket_index].get_all_nodes()
        } else {
            Vec::new()
        }
    }

    pub fn get_stats(&self) -> RoutingTableStats {
        let mut total_alive = 0;
        let mut total_suspected = 0;
        let mut total_offline = 0;
        let mut total_replacement = 0;
        
        for bucket in &self.buckets {
            let stats = bucket.get_node_stats();
            total_alive += stats.alive;
            total_suspected += stats.suspected;
            total_offline += stats.offline;
            total_replacement += stats.replacement_cache;
        }
        
        RoutingTableStats {
            total_alive,
            total_suspected,
            total_offline,
            total_replacement,
        }
    }
}

#[derive(Debug, Clone, Copy)]
pub struct RoutingTableStats {
    pub total_alive: usize,
    pub total_suspected: usize,
    pub total_offline: usize,
    pub total_replacement: usize,
}

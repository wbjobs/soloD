use crate::node_id::{NodeId, NodeInfo};
use std::collections::{VecDeque, HashSet};
use std::time::{Duration, Instant};

pub const K: usize = 20;
pub const BUCKET_COUNT: usize = 160;
pub const NODE_TIMEOUT: Duration = Duration::from_secs(3 * 60 * 60);
pub const MAX_CONSECUTIVE_FAILURES: u32 = 3;
pub const SUSPECTED_OFFLINE_TIMEOUT: Duration = Duration::from_secs(300);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NodeStatus {
    Alive,
    Suspected,
    Offline,
}

#[derive(Debug, Clone)]
pub struct BucketEntry {
    pub node: NodeInfo,
    pub last_seen: Instant,
    pub consecutive_failures: u32,
    pub status: NodeStatus,
    pub last_rtt: Option<Duration>,
    pub avg_rtt: Duration,
    pub suspected_since: Option<Instant>,
}

impl BucketEntry {
    pub fn new(node: NodeInfo) -> Self {
        Self {
            node,
            last_seen: Instant::now(),
            consecutive_failures: 0,
            status: NodeStatus::Alive,
            last_rtt: None,
            avg_rtt: Duration::from_secs(1),
            suspected_since: None,
        }
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

    pub fn should_probe(&self) -> bool {
        if self.status == NodeStatus::Suspected {
            if let Some(since) = self.suspected_since {
                return since.elapsed() > Duration::from_secs(60);
            }
        }
        false
    }

    pub fn record_success(&mut self, rtt: Duration) {
        self.consecutive_failures = 0;
        self.status = NodeStatus::Alive;
        self.last_seen = Instant::now();
        self.last_rtt = Some(rtt);
        self.avg_rtt = Duration::from_millis(
            (self.avg_rtt.as_millis() * 7 + rtt.as_millis()) as u64 / 8,
        );
        self.suspected_since = None;
    }

    pub fn record_failure(&mut self) -> bool {
        self.consecutive_failures += 1;
        if self.consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
            if self.status == NodeStatus::Alive {
                self.status = NodeStatus::Suspected;
                self.suspected_since = Some(Instant::now());
                true
            } else if self.status == NodeStatus::Suspected {
                if let Some(since) = self.suspected_since {
                    if since.elapsed() > SUSPECTED_OFFLINE_TIMEOUT {
                        self.status = NodeStatus::Offline;
                        return true;
                    }
                }
            }
        }
        false
    }

    pub fn confirm_offline(&mut self) {
        self.status = NodeStatus::Offline;
    }

    pub fn update_last_seen(&mut self) {
        self.last_seen = Instant::now();
    }
}

pub struct KBucket {
    entries: VecDeque<BucketEntry>,
    max_size: usize,
    replacement_cache: VecDeque<NodeInfo>,
    max_replacement: usize,
}

impl KBucket {
    pub fn new() -> Self {
        Self {
            entries: VecDeque::new(),
            max_size: K,
            replacement_cache: VecDeque::new(),
            max_replacement: K,
        }
    }

    pub fn with_capacity(capacity: usize) -> Self {
        Self {
            entries: VecDeque::new(),
            max_size: capacity,
            replacement_cache: VecDeque::new(),
            max_replacement: capacity,
        }
    }

    pub fn insert(&mut self, node: NodeInfo) -> InsertResult {
        if let Some(pos) = self.entries.iter().position(|e| e.node.id == node.id) {
            self.entries[pos].update_last_seen();
            self.entries[pos].consecutive_failures = 0;
            self.entries[pos].status = NodeStatus::Alive;
            if pos > 0 {
                let entry = self.entries.remove(pos).unwrap();
                self.entries.push_front(entry);
            }
            return InsertResult::Updated;
        }

        if self.entries.len() < self.max_size {
            self.entries.push_front(BucketEntry::new(node));
            InsertResult::Added
        } else {
            InsertResult::Full(self.entries.back().map(|e| e.node.clone()))
        }
    }

    pub fn add_to_replacement(&mut self, node: NodeInfo) {
        if self.replacement_cache.iter().any(|e| e.id == node.id) {
            return;
        }
        if self.replacement_cache.len() >= self.max_replacement {
            self.replacement_cache.pop_back();
        }
        self.replacement_cache.push_front(node);
    }

    pub fn get_replacement(&mut self) -> Option<NodeInfo> {
        while let Some(node) = self.replacement_cache.pop_front() {
            if !self.entries.iter().any(|e| e.node.id == node.id) {
                return Some(node);
            }
        }
        None
    }

    pub fn remove(&mut self, node_id: &NodeId) -> Option<NodeInfo> {
        if let Some(pos) = self.entries.iter().position(|e| e.node.id == *node_id) {
            let entry = self.entries.remove(pos).unwrap();
            if let Some(replacement) = self.get_replacement() {
                self.entries.push_back(BucketEntry::new(replacement));
            }
            return Some(entry.node);
        }
        None
    }

    pub fn mark_node_failed(&mut self, node_id: &NodeId) -> FailureAction {
        if let Some(pos) = self.entries.iter_mut().position(|e| e.node.id == *node_id) {
            let became_suspected = self.entries[pos].record_failure();
            if self.entries[pos].is_offline() {
                let node = self.entries[pos].node.clone();
                self.entries.remove(pos);
                if let Some(replacement) = self.get_replacement() {
                    self.entries.push_back(BucketEntry::new(replacement));
                }
                return FailureAction::Removed(node);
            }
            if became_suspected {
                return FailureAction::Suspected(self.entries[pos].node.clone());
            }
        }
        FailureAction::None
    }

    pub fn mark_node_success(&mut self, node_id: &NodeId, rtt: Duration) {
        if let Some(pos) = self.entries.iter().position(|e| e.node.id == *node_id) {
            self.entries[pos].record_success(rtt);
            if pos > 0 {
                let entry = self.entries.remove(pos).unwrap();
                self.entries.push_front(entry);
            }
        }
    }

    pub fn get(&self, node_id: &NodeId) -> Option<&NodeInfo> {
        self.entries
            .iter()
            .find(|e| e.node.id == *node_id && !e.is_offline())
            .map(|e| &e.node)
    }

    pub fn get_alive_nodes(&self, count: usize) -> Vec<NodeInfo> {
        self.entries
            .iter()
            .filter(|e| e.is_alive())
            .take(count)
            .map(|e| e.node.clone())
            .collect()
    }

    pub fn get_suspected_nodes(&self) -> Vec<NodeInfo> {
        self.entries
            .iter()
            .filter(|e| e.is_suspected() && e.should_probe())
            .map(|e| e.node.clone())
            .collect()
    }

    pub fn get_all_nodes(&self) -> Vec<NodeInfo> {
        self.entries
            .iter()
            .filter(|e| !e.is_offline())
            .map(|e| e.node.clone())
            .collect()
    }

    pub fn len(&self) -> usize {
        self.entries.iter().filter(|e| !e.is_offline()).count()
    }

    pub fn total_entries(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    pub fn get_oldest(&self) -> Option<&NodeInfo> {
        self.entries
            .iter()
            .rev()
            .find(|e| !e.is_offline())
            .map(|e| &e.node)
    }

    pub fn get_latest(&self) -> Option<&NodeInfo> {
        self.entries
            .iter()
            .find(|e| !e.is_offline())
            .map(|e| &e.node)
    }

    pub fn cleanup_offline(&mut self) -> Vec<NodeInfo> {
        let mut removed = Vec::new();
        self.entries.retain(|e| {
            if e.is_offline() {
                removed.push(e.node.clone());
                false
            } else {
                true
            }
        });
        while self.entries.len() < self.max_size && let Some(replacement) = self.get_replacement() {
            self.entries.push_back(BucketEntry::new(replacement));
        }
        removed
    }

    pub fn cleanup_stale(&mut self) -> Vec<NodeInfo> {
        let mut removed = Vec::new();
        self.entries.retain(|e| {
            if !e.is_offline() && e.last_seen.elapsed() >= NODE_TIMEOUT {
                removed.push(e.node.clone());
                false
            } else {
                true
            }
        });
        while self.entries.len() < self.max_size && let Some(replacement) = self.get_replacement() {
            self.entries.push_back(BucketEntry::new(replacement));
        }
        removed
    }

    pub fn get_node_stats(&self) -> BucketStats {
        let mut alive = 0;
        let mut suspected = 0;
        let mut offline = 0;
        for entry in &self.entries {
            match entry.status {
                NodeStatus::Alive => alive += 1,
                NodeStatus::Suspected => suspected += 1,
                NodeStatus::Offline => offline += 1,
            }
        }
        BucketStats {
            alive,
            suspected,
            offline,
            replacement_cache: self.replacement_cache.len(),
        }
    }
}

impl Default for KBucket {
    fn default() -> Self {
        Self::new()
    }
}

pub enum InsertResult {
    Added,
    Updated,
    Full(Option<NodeInfo>),
}

pub enum FailureAction {
    None,
    Suspected(NodeInfo),
    Removed(NodeInfo),
}

#[derive(Debug, Clone, Copy)]
pub struct BucketStats {
    pub alive: usize,
    pub suspected: usize,
    pub offline: usize,
    pub replacement_cache: usize,
}

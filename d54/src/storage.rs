use crate::hotness::{HotnessLevel, HotnessTracker, ReplicaManager};
use crate::node_id::NodeId;
use dashmap::DashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tracing::{debug, info, warn};

pub const REPUBLISH_INTERVAL: Duration = Duration::from_secs(3600);
pub const DATA_EXPIRY: Duration = Duration::from_secs(24 * 3600);
pub const ORIGIN_POINTER_TTL: Duration = Duration::from_secs(12 * 3600);

#[derive(Debug, Clone)]
pub struct StoredValue {
    pub value: Vec<u8>,
    pub stored_at: Instant,
    pub republished_at: Instant,
    pub hotness: HotnessLevel,
    pub has_origin_pointer: bool,
    pub origin_peer: Option<NodeId>,
}

pub struct Storage {
    data: Arc<DashMap<NodeId, StoredValue>>,
    hotness_tracker: Arc<HotnessTracker>,
    replica_manager: Arc<ReplicaManager>,
}

impl Storage {
    pub fn new() -> Self {
        Self {
            data: Arc::new(DashMap::new()),
            hotness_tracker: Arc::new(HotnessTracker::new()),
            replica_manager: Arc::new(ReplicaManager::new()),
        }
    }

    pub fn with_origin_peer(origin_peer: NodeId) -> Self {
        Self {
            data: Arc::new(DashMap::new()),
            hotness_tracker: Arc::new(HotnessTracker::with_origin_peer(origin_peer)),
            replica_manager: Arc::new(ReplicaManager::new()),
        }
    }

    pub fn hotness_tracker(&self) -> Arc<HotnessTracker> {
        self.hotness_tracker.clone()
    }

    pub fn replica_manager(&self) -> Arc<ReplicaManager> {
        self.replica_manager.clone()
    }

    pub fn store(&self, key: NodeId, value: Vec<u8>) {
        let now = Instant::now();
        let hotness = self.hotness_tracker.get_hotness(key);
        
        let has_origin_pointer = hotness == HotnessLevel::Cold;
        let origin_peer = if has_origin_pointer {
            self.hotness_tracker.origin_peer()
        } else {
            None
        };

        self.data.insert(
            key,
            StoredValue {
                value,
                stored_at: now,
                republished_at: now,
                hotness,
                has_origin_pointer,
                origin_peer,
            },
        );
        debug!("Stored data for key: {:?}, hotness: {:?}", key, hotness);
    }

    pub fn store_with_origin_pointer(&self, key: NodeId, origin_peer: NodeId) {
        let now = Instant::now();
        
        self.data.insert(
            key,
            StoredValue {
                value: Vec::new(),
                stored_at: now,
                republished_at: now,
                hotness: HotnessLevel::Cold,
                has_origin_pointer: true,
                origin_peer: Some(origin_peer),
            },
        );
        debug!("Stored origin pointer for key: {:?}, origin: {:?}", key, origin_peer);
    }

    pub fn get(&self, key: NodeId) -> Option<Vec<u8>> {
        self.hotness_tracker.record_request(key);
        
        let entry = self.data.get(&key)?;
        
        if entry.has_origin_pointer && entry.value.is_empty() {
            debug!("Hit origin pointer for key: {:?}, need to fetch from origin", key);
            return None;
        }
        
        Some(entry.value.clone())
    }

    pub fn get_with_metadata(&self, key: NodeId) -> Option<StoredValue> {
        self.hotness_tracker.record_request(key);
        self.data.get(&key).map(|e| e.clone())
    }

    pub fn get_origin_peer(&self, key: NodeId) -> Option<NodeId> {
        self.data.get(&key).and_then(|e| e.origin_peer)
    }

    pub fn has_origin_pointer(&self, key: NodeId) -> bool {
        self.data
            .get(&key)
            .map(|e| e.has_origin_pointer && e.value.is_empty())
            .unwrap_or(false)
    }

    pub fn contains(&self, key: &NodeId) -> bool {
        self.data.contains_key(key)
    }

    pub fn remove(&self, key: &NodeId) -> Option<Vec<u8>> {
        self.data.remove(key).map(|(_, v)| v.value)
    }

    pub fn get_keys_needing_republish(&self) -> Vec<NodeId> {
        let now = Instant::now();
        let mut keys = Vec::new();

        for entry in self.data.iter() {
            if now.duration_since(entry.republished_at) > REPUBLISH_INTERVAL {
                keys.push(*entry.key());
            }
        }

        keys
    }

    pub fn update_republished(&self, key: NodeId) {
        if let Some(mut entry) = self.data.get_mut(&key) {
            entry.republished_at = Instant::now();
        }
    }

    pub fn update_hotness(&self, key: NodeId) -> (HotnessLevel, HotnessLevel) {
        let old_hotness = self
            .data
            .get(&key)
            .map(|e| e.hotness)
            .unwrap_or(HotnessLevel::Cold);
        let new_hotness = self.hotness_tracker.get_hotness(key);

        if old_hotness != new_hotness {
            if let Some(mut entry) = self.data.get_mut(&key) {
                entry.hotness = new_hotness;
                entry.has_origin_pointer = new_hotness == HotnessLevel::Cold;
                if entry.has_origin_pointer {
                    entry.origin_peer = self.hotness_tracker.origin_peer();
                } else {
                    entry.origin_peer = None;
                }
            }
            info!(
                "Hotness changed for {:?}: {:?} -> {:?}",
                key, old_hotness, new_hotness
            );
        }

        (old_hotness, new_hotness)
    }

    pub fn get_replication_factor(&self, key: NodeId) -> usize {
        self.hotness_tracker.get_replication_factor(key)
    }

    pub fn get_hotness(&self, key: NodeId) -> HotnessLevel {
        self.hotness_tracker.get_hotness(key)
    }

    pub fn cleanup_expired(&self) -> Vec<NodeId> {
        let now = Instant::now();
        let mut expired = Vec::new();

        let keys: Vec<NodeId> = self.data.iter().map(|e| *e.key()).collect();
        for key in keys {
            if let Some(entry) = self.data.get(&key) {
                if now.duration_since(entry.stored_at) > DATA_EXPIRY {
                    expired.push(key);
                }
            }
        }

        for key in &expired {
            self.data.remove(key);
        }

        self.hotness_tracker.cleanup_expired();
        expired
    }

    pub fn len(&self) -> usize {
        self.data.len()
    }

    pub fn is_empty(&self) -> bool {
        self.data.is_empty()
    }

    pub fn get_all_keys(&self) -> Vec<NodeId> {
        self.data.iter().map(|e| *e.key()).collect()
    }

    pub fn get_all_with_hotness(&self) -> Vec<(NodeId, HotnessLevel, usize)> {
        let mut result = Vec::new();
        for entry in self.data.iter() {
            let replica_count = self.replica_manager.replica_count(*entry.key());
            result.push((*entry.key(), entry.hotness, replica_count));
        }
        result
    }

    pub fn get_keys_for_migration(&self) -> Vec<(NodeId, HotnessLevel, usize, usize)> {
        let mut result = Vec::new();
        for entry in self.data.iter() {
            let current_replicas = self.replica_manager.replica_count(*entry.key());
            let target_replicas = entry.hotness.replication_factor();
            result.push((*entry.key(), entry.hotness, current_replicas, target_replicas));
        }
        result
    }
}

impl Default for Storage {
    fn default() -> Self {
        Self::new()
    }
}

pub struct RepublishManager {
    last_republish: Instant,
}

impl RepublishManager {
    pub fn new() -> Self {
        Self {
            last_republish: Instant::now(),
        }
    }

    pub fn should_republish(&self) -> bool {
        self.last_republish.elapsed() > REPUBLISH_INTERVAL / 2
    }

    pub fn update_republish_time(&mut self) {
        self.last_republish = Instant::now();
    }
}

impl Default for RepublishManager {
    fn default() -> Self {
        Self::new()
    }
}

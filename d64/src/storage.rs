use crate::id::NodeId;
use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};
use std::sync::Arc;

pub const REPUBLISH_INTERVAL: Duration = Duration::from_secs(3600);
pub const DATA_EXPIRATION: Duration = Duration::from_secs(24 * 3600);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredValue {
    pub value: Vec<u8>,
    pub stored_at: Instant,
    pub expires_at: Instant,
    pub publisher: NodeId,
}

pub struct DataStorage {
    store: DashMap<NodeId, StoredValue>,
}

impl DataStorage {
    pub fn new() -> Self {
        DataStorage {
            store: DashMap::new(),
        }
    }
    
    pub fn store(&self, key: NodeId, value: Vec<u8>, publisher: NodeId) {
        let now = Instant::now();
        let stored = StoredValue {
            value,
            stored_at: now,
            expires_at: now + DATA_EXPIRATION,
            publisher,
        };
        self.store.insert(key, stored);
    }
    
    pub fn get(&self, key: &NodeId) -> Option<Vec<u8>> {
        self.store.get(key).map(|entry| entry.value.clone())
    }
    
    pub fn remove(&self, key: &NodeId) -> Option<StoredValue> {
        self.store.remove(key).map(|(_, v)| v)
    }
    
    pub fn contains(&self, key: &NodeId) -> bool {
        self.store.contains_key(key)
    }
    
    pub fn len(&self) -> usize {
        self.store.len()
    }
    
    pub fn is_empty(&self) -> bool {
        self.store.is_empty()
    }
    
    pub fn cleanup_expired(&self) -> usize {
        let mut removed = 0;
        let now = Instant::now();
        
        self.store.retain(|_, value| {
            if value.expires_at > now {
                true
            } else {
                removed += 1;
                false
            }
        });
        
        removed
    }
    
    pub fn get_keys_for_republish(&self) -> Vec<(NodeId, StoredValue)> {
        let now = Instant::now();
        let mut result = Vec::new();
        
        for entry in self.store.iter() {
            let key = *entry.key();
            let value = entry.value();
            if now.duration_since(value.stored_at) >= REPUBLISH_INTERVAL {
                result.push((key, value.clone()));
            }
        }
        
        result
    }
    
    pub fn all_keys(&self) -> Vec<NodeId> {
        self.store.iter().map(|entry| *entry.key()).collect()
    }
}

impl Default for DataStorage {
    fn default() -> Self {
        Self::new()
    }
}

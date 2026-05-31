use crate::node_id::NodeId;
use dashmap::DashMap;
use std::collections::VecDeque;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tracing::debug;

pub const SLIDING_WINDOW_DURATION: Duration = Duration::from_secs(3600);
pub const MIGRATION_INTERVAL: Duration = Duration::from_secs(300);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HotnessLevel {
    Hot,
    Warm,
    Cold,
}

impl HotnessLevel {
    pub fn replication_factor(&self) -> usize {
        match self {
            HotnessLevel::Hot => 20,
            HotnessLevel::Warm => 10,
            HotnessLevel::Cold => 3,
        }
    }

    pub fn from_request_count(count: u64) -> Self {
        match count {
            0..=10 => HotnessLevel::Cold,
            11..=100 => HotnessLevel::Warm,
            _ => HotnessLevel::Hot,
        }
    }
}

#[derive(Clone)]
struct RequestWindow {
    timestamps: VecDeque<Instant>,
}

impl RequestWindow {
    fn new() -> Self {
        Self {
            timestamps: VecDeque::new(),
        }
    }

    fn record_request(&mut self) {
        let now = Instant::now();
        self.timestamps.push_back(now);
        self.cleanup(now);
    }

    fn cleanup(&mut self, now: Instant) {
        while let Some(&oldest) = self.timestamps.front() {
            if now.duration_since(oldest) > SLIDING_WINDOW_DURATION {
                self.timestamps.pop_front();
            } else {
                break;
            }
        }
    }

    fn count(&mut self) -> u64 {
        self.cleanup(Instant::now());
        self.timestamps.len() as u64
    }
}

pub struct HotnessTracker {
    request_counts: Arc<DashMap<NodeId, RequestWindow>>,
    origin_peer: Option<NodeId>,
}

impl HotnessTracker {
    pub fn new() -> Self {
        Self {
            request_counts: Arc::new(DashMap::new()),
            origin_peer: None,
        }
    }

    pub fn with_origin_peer(origin_peer: NodeId) -> Self {
        Self {
            request_counts: Arc::new(DashMap::new()),
            origin_peer: Some(origin_peer),
        }
    }

    pub fn set_origin_peer(&mut self, origin_peer: NodeId) {
        self.origin_peer = Some(origin_peer);
    }

    pub fn origin_peer(&self) -> Option<NodeId> {
        self.origin_peer
    }

    pub fn record_request(&self, key: NodeId) {
        let mut entry = self
            .request_counts
            .entry(key)
            .or_insert_with(RequestWindow::new);
        entry.record_request();
    }

    pub fn get_hotness(&self, key: NodeId) -> HotnessLevel {
        let count = self
            .request_counts
            .get_mut(&key)
            .map(|mut w| w.count())
            .unwrap_or(0);
        HotnessLevel::from_request_count(count)
    }

    pub fn get_replication_factor(&self, key: NodeId) -> usize {
        self.get_hotness(key).replication_factor()
    }

    pub fn get_all_hotness(&self) -> Vec<(NodeId, HotnessLevel, u64)> {
        let mut result = Vec::new();
        for mut entry in self.request_counts.iter_mut() {
            let count = entry.count();
            let hotness = HotnessLevel::from_request_count(count);
            result.push((*entry.key(), hotness, count));
        }
        result
    }

    pub fn cleanup_expired(&self) {
        let now = Instant::now();
        let mut to_remove = Vec::new();
        
        for entry in self.request_counts.iter() {
            if let Some(window) = self.request_counts.get_mut(entry.key()) {
                window.cleanup(now);
                if window.timestamps.is_empty() {
                    to_remove.push(*entry.key());
                }
            }
        }
        
        for key in to_remove {
            self.request_counts.remove(&key);
        }
    }

    pub fn needs_more_replicas(&self, key: NodeId, current_replicas: usize) -> bool {
        let target = self.get_replication_factor(key);
        current_replicas < target
    }

    pub fn needs_less_replicas(&self, key: NodeId, current_replicas: usize) -> bool {
        let target = self.get_replication_factor(key);
        current_replicas > target
    }
}

impl Default for HotnessTracker {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone)]
pub struct ReplicaInfo {
    pub key: NodeId,
    pub location: NodeId,
    pub distance: u32,
    pub confirmed: bool,
}

pub struct ReplicaManager {
    replicas: Arc<DashMap<NodeId, Vec<ReplicaInfo>>>,
    pending_migrations: Arc<DashMap<NodeId, MigrationTask>>,
}

#[derive(Debug, Clone)]
pub struct MigrationTask {
    pub key: NodeId,
    pub from: Option<NodeId>,
    pub to: NodeId,
    pub status: MigrationStatus,
    pub created_at: Instant,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MigrationStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
}

impl ReplicaManager {
    pub fn new() -> Self {
        Self {
            replicas: Arc::new(DashMap::new()),
            pending_migrations: Arc::new(DashMap::new()),
        }
    }

    pub fn add_replica(&self, key: NodeId, location: NodeId, distance: u32) {
        let mut replicas = self.replicas.entry(key).or_insert_with(Vec::new);
        if !replicas.iter().any(|r| r.location == location) {
            replicas.push(ReplicaInfo {
                key,
                location,
                distance,
                confirmed: true,
            });
            replicas.sort_by_key(|r| r.distance);
        }
    }

    pub fn remove_replica(&self, key: NodeId, location: NodeId) {
        if let Some(mut replicas) = self.replicas.get_mut(&key) {
            replicas.retain(|r| r.location != location);
        }
    }

    pub fn get_replicas(&self, key: NodeId) -> Vec<ReplicaInfo> {
        self.replicas
            .get(&key)
            .map(|r| r.clone())
            .unwrap_or_default()
    }

    pub fn replica_count(&self, key: NodeId) -> usize {
        self.replicas.get(&key).map(|r| r.len()).unwrap_or(0)
    }

    pub fn start_migration(&self, key: NodeId, from: Option<NodeId>, to: NodeId) -> bool {
        if self.pending_migrations.contains_key(&key) {
            return false;
        }
        
        self.pending_migrations.insert(
            key,
            MigrationTask {
                key,
                from,
                to,
                status: MigrationStatus::Pending,
                created_at: Instant::now(),
            },
        );
        true
    }

    pub fn complete_migration(&self, key: NodeId, success: bool) {
        if let Some(mut task) = self.pending_migrations.get_mut(&key) {
            task.status = if success {
                MigrationStatus::Completed
            } else {
                MigrationStatus::Failed
            };
        }
    }

    pub fn has_pending_migration(&self, key: NodeId) -> bool {
        self.pending_migrations
            .get(&key)
            .map(|t| t.status == MigrationStatus::Pending || t.status == MigrationStatus::InProgress)
            .unwrap_or(false)
    }

    pub fn cleanup_completed_migrations(&self) {
        let mut to_remove = Vec::new();
        for entry in self.pending_migrations.iter() {
            if entry.status == MigrationStatus::Completed
                || entry.status == MigrationStatus::Failed
                || entry.created_at.elapsed() > Duration::from_secs(600)
            {
                to_remove.push(*entry.key());
            }
        }
        for key in to_remove {
            self.pending_migrations.remove(&key);
        }
    }

    pub fn get_optimal_replica_locations(
        &self,
        key: NodeId,
        count: usize,
        nodes: &[crate::node_id::NodeInfo],
    ) -> Vec<crate::node_id::NodeInfo> {
        let mut sorted_nodes: Vec<_> = nodes
            .iter()
            .map(|n| (n, n.id.distance(&key)))
            .collect();
        
        sorted_nodes.sort_by_key(|(_, d)| *d);
        
        sorted_nodes
            .into_iter()
            .take(count)
            .map(|(n, _)| n.clone())
            .collect()
    }
}

impl Default for ReplicaManager {
    fn default() -> Self {
        Self::new()
    }
}

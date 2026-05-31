use crate::node_id::NodeId;
use std::net::SocketAddr;

#[derive(Debug, Clone)]
pub struct Config {
    pub listen_addr: SocketAddr,
    pub bootstrap_nodes: Vec<(NodeId, SocketAddr)>,
    pub k: usize,
    pub alpha: usize,
    pub node_timeout_hours: u64,
    pub republish_interval_hours: u64,
    pub data_expiry_hours: u64,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            listen_addr: "0.0.0.0:8080".parse().unwrap(),
            bootstrap_nodes: Vec::new(),
            k: 20,
            alpha: 3,
            node_timeout_hours: 3,
            republish_interval_hours: 1,
            data_expiry_hours: 24,
        }
    }
}

impl Config {
    pub fn new(listen_addr: SocketAddr) -> Self {
        Self {
            listen_addr,
            ..Default::default()
        }
    }

    pub fn with_bootstrap(mut self, node_id: NodeId, addr: SocketAddr) -> Self {
        self.bootstrap_nodes.push((node_id, addr));
        self
    }

    pub fn bootstrap_nodes_info(&self) -> Vec<crate::node_id::NodeInfo> {
        self.bootstrap_nodes
            .iter()
            .map(|(id, addr)| crate::node_id::NodeInfo::new(*id, *addr))
            .collect()
    }
}

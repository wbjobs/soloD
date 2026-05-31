use crate::node_id::{NodeId, NodeInfo};
use serde::{Deserialize, Serialize};
use std::time::Duration;

pub const ALPHA: usize = 3;
pub const BASE_TIMEOUT: Duration = Duration::from_secs(5);
pub const MAX_TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RpcMessage {
    pub id: u64,
    pub sender: NodeId,
    pub body: RpcBody,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RpcBody {
    Request(RpcRequest),
    Response(RpcResponse),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RpcRequest {
    Ping,
    FindNode { target: NodeId },
    FindValue { key: NodeId },
    Store { key: NodeId, value: Vec<u8> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RpcResponse {
    Pong,
    FindNode { nodes: Vec<NodeInfo> },
    FindValue { nodes: Vec<NodeInfo>, value: Option<Vec<u8>> },
    StoreAck,
    Error { message: String },
}

impl RpcMessage {
    pub fn new_ping(id: u64, sender: NodeId) -> Self {
        Self {
            id,
            sender,
            body: RpcBody::Request(RpcRequest::Ping),
        }
    }

    pub fn new_pong(id: u64, sender: NodeId) -> Self {
        Self {
            id,
            sender,
            body: RpcBody::Response(RpcResponse::Pong),
        }
    }

    pub fn new_find_node(id: u64, sender: NodeId, target: NodeId) -> Self {
        Self {
            id,
            sender,
            body: RpcBody::Request(RpcRequest::FindNode { target }),
        }
    }

    pub fn new_find_node_response(id: u64, sender: NodeId, nodes: Vec<NodeInfo>) -> Self {
        Self {
            id,
            sender,
            body: RpcBody::Response(RpcResponse::FindNode { nodes }),
        }
    }

    pub fn new_find_value(id: u64, sender: NodeId, key: NodeId) -> Self {
        Self {
            id,
            sender,
            body: RpcBody::Request(RpcRequest::FindValue { key }),
        }
    }

    pub fn new_find_value_response(
        id: u64,
        sender: NodeId,
        nodes: Vec<NodeInfo>,
        value: Option<Vec<u8>>,
    ) -> Self {
        Self {
            id,
            sender,
            body: RpcBody::Response(RpcResponse::FindValue { nodes, value }),
        }
    }

    pub fn new_store(id: u64, sender: NodeId, key: NodeId, value: Vec<u8>) -> Self {
        Self {
            id,
            sender,
            body: RpcBody::Request(RpcRequest::Store { key, value }),
        }
    }

    pub fn new_store_ack(id: u64, sender: NodeId) -> Self {
        Self {
            id,
            sender,
            body: RpcBody::Response(RpcResponse::StoreAck),
        }
    }

    pub fn new_error(id: u64, sender: NodeId, message: String) -> Self {
        Self {
            id,
            sender,
            body: RpcBody::Response(RpcResponse::Error { message }),
        }
    }
}

pub fn serialize(msg: &RpcMessage) -> Result<Vec<u8>, bincode::Error> {
    bincode::serialize(msg)
}

pub fn deserialize(data: &[u8]) -> Result<RpcMessage, bincode::Error> {
    bincode::deserialize(data)
}

pub struct RttEstimator {
    smoothed_rtt: Duration,
    rtt_var: Duration,
}

impl RttEstimator {
    pub fn new() -> Self {
        Self {
            smoothed_rtt: BASE_TIMEOUT,
            rtt_var: Duration::from_millis(250),
        }
    }

    pub fn update(&mut self, rtt: Duration) {
        const ALPHA: f64 = 0.125;
        const BETA: f64 = 0.25;

        let rtt_var = self.rtt_var.as_secs_f64();
        let smoothed_rtt = self.smoothed_rtt.as_secs_f64();
        let rtt_secs = rtt.as_secs_f64();

        let rtt_diff = (smoothed_rtt - rtt_secs).abs();
        let new_rtt_var = (1.0 - BETA) * rtt_var + BETA * rtt_diff;
        let new_smoothed_rtt = (1.0 - ALPHA) * smoothed_rtt + ALPHA * rtt_secs;

        self.rtt_var = Duration::from_secs_f64(new_rtt_var);
        self.smoothed_rtt = Duration::from_secs_f64(new_smoothed_rtt);
    }

    pub fn timeout(&self) -> Duration {
        let timeout = self.smoothed_rtt + Duration::from_millis(4 * self.rtt_var.as_millis() as u64);
        timeout.clamp(BASE_TIMEOUT, MAX_TIMEOUT)
    }
}

impl Default for RttEstimator {
    fn default() -> Self {
        Self::new()
    }
}

use crate::id::{NodeId, Distance};
use crate::routing_table::NodeInfo;
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};
use std::net::SocketAddr;

pub const ALPHA: usize = 3;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RpcMessage {
    Request(Request),
    Response(Response),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Request {
    pub id: u64,
    pub sender_id: NodeId,
    pub sender_addr: SocketAddr,
    pub body: RequestBody,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RequestBody {
    Ping,
    FindNode { target: NodeId },
    FindValue { key: NodeId },
    Store { key: NodeId, value: Vec<u8> },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Response {
    pub id: u64,
    pub sender_id: NodeId,
    pub sender_addr: SocketAddr,
    pub body: ResponseBody,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ResponseBody {
    Pong,
    FindNodeResult { nodes: Vec<NodeInfo> },
    FindValueResult { value: Option<Vec<u8>>, nodes: Vec<NodeInfo> },
    StoreResult { success: bool },
}

pub struct RpcContext {
    request_id: u64,
    local_id: NodeId,
    local_addr: SocketAddr,
}

impl RpcContext {
    pub fn new(local_id: NodeId, local_addr: SocketAddr) -> Self {
        RpcContext {
            request_id: 0,
            local_id,
            local_addr,
        }
    }
    
    pub fn next_request_id(&mut self) -> u64 {
        self.request_id += 1;
        self.request_id
    }
    
    pub fn create_request(&mut self, body: RequestBody) -> Request {
        Request {
            id: self.next_request_id(),
            sender_id: self.local_id,
            sender_addr: self.local_addr,
            body,
        }
    }
    
    pub fn create_response(&self, request: &Request, body: ResponseBody) -> Response {
        Response {
            id: request.id,
            sender_id: self.local_id,
            sender_addr: self.local_addr,
            body,
        }
    }
}

#[derive(Debug, Clone)]
pub struct RpcResult<T> {
    pub result: T,
    pub rtt: Duration,
    pub responder: NodeInfo,
}

pub struct ParallelQuery<T> {
    target: NodeId,
    alpha: usize,
    results: Vec<RpcResult<T>>,
    start_time: Instant,
    timeout: Duration,
}

impl<T> ParallelQuery<T> {
    pub fn new(target: NodeId, alpha: usize) -> Self {
        ParallelQuery {
            target,
            alpha,
            results: Vec::new(),
            start_time: Instant::now(),
            timeout: Duration::from_secs(5),
        }
    }
    
    pub fn with_timeout(target: NodeId, alpha: usize, timeout: Duration) -> Self {
        ParallelQuery {
            target,
            alpha,
            results: Vec::new(),
            start_time: Instant::now(),
            timeout,
        }
    }
    
    pub fn add_result(&mut self, result: RpcResult<T>) {
        self.results.push(result);
    }
    
    pub fn is_timed_out(&self) -> bool {
        self.start_time.elapsed() > self.timeout
    }
    
    pub fn results(&self) -> &[RpcResult<T>] {
        &self.results
    }
    
    pub fn fastest_result(&self) -> Option<&RpcResult<T>> {
        self.results.iter().min_by_key(|r| r.rtt)
    }
    
    pub fn alpha(&self) -> usize {
        self.alpha
    }
    
    pub fn target(&self) -> NodeId {
        self.target
    }
}

pub fn calculate_dynamic_timeout(base_timeout: Duration, rtt: Option<Duration>) -> Duration {
    match rtt {
        Some(rtt) => {
            let dynamic = rtt.mul_f32(3.0);
            dynamic.max(base_timeout)
        }
        None => base_timeout,
    }
}

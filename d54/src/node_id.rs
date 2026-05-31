use sha1::{Digest, Sha1};
use std::fmt;
use std::net::SocketAddr;

const NODE_ID_LEN: usize = 20;

#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, serde::Serialize, serde::Deserialize)]
pub struct NodeId(pub [u8; NODE_ID_LEN]);

impl NodeId {
    pub fn new() -> Self {
        let random_bytes: [u8; NODE_ID_LEN] = rand::random();
        Self(random_bytes)
    }

    pub fn from_public_key(public_key: &[u8]) -> Self {
        let mut hasher = Sha1::new();
        hasher.update(public_key);
        let result = hasher.finalize();
        let mut bytes = [0u8; NODE_ID_LEN];
        bytes.copy_from_slice(&result[..]);
        Self(bytes)
    }

    pub fn from_hash(data: &[u8]) -> Self {
        let mut hasher = Sha1::new();
        hasher.update(data);
        let result = hasher.finalize();
        let mut bytes = [0u8; NODE_ID_LEN];
        bytes.copy_from_slice(&result[..]);
        Self(bytes)
    }

    pub fn distance(&self, other: &NodeId) -> Distance {
        let mut result = [0u8; NODE_ID_LEN];
        for i in 0..NODE_ID_LEN {
            result[i] = self.0[i] ^ other.0[i];
        }
        Distance(result)
    }

    pub fn bucket_index(&self, other: &NodeId) -> usize {
        let distance = self.distance(other);
        distance.leading_zeros()
    }

    pub fn as_bytes(&self) -> &[u8] {
        &self.0
    }

    pub fn to_vec(&self) -> Vec<u8> {
        self.0.to_vec()
    }
}

impl Default for NodeId {
    fn default() -> Self {
        Self::new()
    }
}

impl fmt::Debug for NodeId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "NodeId({})", hex::encode(&self.0[0..4]))
    }
}

impl fmt::Display for NodeId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", hex::encode(&self.0))
    }
}

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, serde::Serialize, serde::Deserialize)]
pub struct Distance(pub [u8; NODE_ID_LEN]);

impl Distance {
    pub fn leading_zeros(&self) -> usize {
        let mut count = 0;
        for &byte in &self.0 {
            if byte == 0 {
                count += 8;
            } else {
                count += byte.leading_zeros() as usize;
                break;
            }
        }
        count
    }

    pub fn is_zero(&self) -> bool {
        self.0.iter().all(|&b| b == 0)
    }

    pub fn max() -> Self {
        Distance([0xff; NODE_ID_LEN])
    }
}

impl fmt::Debug for Distance {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Distance({:02x?})", &self.0[0..4])
    }
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct NodeInfo {
    pub id: NodeId,
    pub addr: SocketAddr,
}

impl NodeInfo {
    pub fn new(id: NodeId, addr: SocketAddr) -> Self {
        Self { id, addr }
    }
}

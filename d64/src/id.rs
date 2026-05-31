use sha1::{Digest, Sha1};
use serde::{Deserialize, Serialize};
use rand::Rng;
use std::fmt;
use std::cmp::Ordering;

#[derive(Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct NodeId(pub [u8; 20]);

impl NodeId {
    pub const BITS: usize = 160;
    
    pub fn new() -> Self {
        let mut rng = rand::thread_rng();
        let mut bytes = [0u8; 20];
        rng.fill(&mut bytes);
        NodeId(bytes)
    }
    
    pub fn from_public_key(public_key: &[u8]) -> Self {
        let mut hasher = Sha1::new();
        hasher.update(public_key);
        let result = hasher.finalize();
        let mut bytes = [0u8; 20];
        bytes.copy_from_slice(&result);
        NodeId(bytes)
    }
    
    pub fn from_data(data: &[u8]) -> Self {
        let mut hasher = Sha1::new();
        hasher.update(data);
        let result = hasher.finalize();
        let mut bytes = [0u8; 20];
        bytes.copy_from_slice(&result);
        NodeId(bytes)
    }
    
    pub fn distance(&self, other: &NodeId) -> Distance {
        let mut result = [0u8; 20];
        for i in 0..20 {
            result[i] = self.0[i] ^ other.0[i];
        }
        Distance(result)
    }
    
    pub fn leading_zero_bits(&self) -> usize {
        for (i, &byte) in self.0.iter().enumerate() {
            if byte != 0 {
                return i * 8 + byte.leading_zeros() as usize;
            }
        }
        160
    }
    
    pub fn bucket_index(&self, other: &NodeId) -> usize {
        self.distance(other).leading_zero_bits()
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

#[derive(Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Distance(pub [u8; 20]);

impl Distance {
    pub fn leading_zero_bits(&self) -> usize {
        for (i, &byte) in self.0.iter().enumerate() {
            if byte != 0 {
                return i * 8 + byte.leading_zeros() as usize;
            }
        }
        160
    }
    
    pub fn is_zero(&self) -> bool {
        self.0.iter().all(|&b| b == 0)
    }
}

impl Ord for Distance {
    fn cmp(&self, other: &Self) -> Ordering {
        for i in 0..20 {
            match self.0[i].cmp(&other.0[i]) {
                Ordering::Equal => continue,
                ord => return ord,
            }
        }
        Ordering::Equal
    }
}

impl PartialOrd for Distance {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl fmt::Debug for Distance {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Distance({})", hex::encode(&self.0[0..4]))
    }
}

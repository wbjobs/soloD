from enum import Enum
from typing import List, Dict, Optional, Callable
import threading
import time
import random
import os
import json
import pickle


class NodeState(Enum):
    FOLLOWER = "follower"
    CANDIDATE = "candidate"
    LEADER = "leader"


class LogEntry:
    def __init__(self, term: int, command: dict):
        self.term = term
        self.command = command
    
    def to_dict(self):
        return {"term": self.term, "command": self.command}
    
    @classmethod
    def from_dict(cls, data):
        return cls(data["term"], data["command"])


class Snapshot:
    def __init__(self, last_index: int, last_term: int, data: bytes):
        self.last_index = last_index
        self.last_term = last_term
        self.data = data


class RaftState:
    SNAPSHOT_THRESHOLD = 1000
    
    def __init__(self, node_id: str, peers: List[str], data_dir: str):
        self.node_id = node_id
        self.peers = peers
        self.data_dir = data_dir
        self.snapshot_dir = os.path.join(data_dir, "snapshots")
        os.makedirs(self.snapshot_dir, exist_ok=True)
        
        self.state = NodeState.FOLLOWER
        self.current_term = 0
        self.voted_for = None
        
        self.snapshot_index = 0
        self.snapshot_term = 0
        
        self.log: List[LogEntry] = [LogEntry(0, {})]
        
        self.commit_index = 0
        self.last_applied = 0
        
        self.next_index: Dict[str, int] = {}
        self.match_index: Dict[str, int] = {}
        
        self.leader_id: Optional[str] = None
        
        self.election_timeout = random.uniform(300, 500) / 1000
        self.last_heartbeat = time.time()
        
        self.state_machine_callback: Optional[Callable[[dict], None]] = None
        self.snapshot_callback: Optional[Callable[[], bytes]] = None
        self.restore_callback: Optional[Callable[[bytes], None]] = None
        
        self._lock = threading.RLock()
        self._snapshot_lock = threading.Lock()
    
    def reset_election_timer(self):
        with self._lock:
            self.last_heartbeat = time.time()
            self.election_timeout = random.uniform(300, 500) / 1000
    
    def is_election_timeout(self) -> bool:
        with self._lock:
            return time.time() - self.last_heartbeat > self.election_timeout
    
    def get_last_log_index(self) -> int:
        with self._lock:
            return self.snapshot_index + len(self.log) - 1
    
    def get_last_log_term(self) -> int:
        with self._lock:
            if self.log:
                return self.log[-1].term
            return self.snapshot_term
    
    def get_log_term(self, index: int) -> int:
        with self._lock:
            if index == self.snapshot_index:
                return self.snapshot_term
            
            relative_index = index - self.snapshot_index
            if 0 <= relative_index < len(self.log):
                return self.log[relative_index].term
            return 0
    
    def append_log(self, entry: LogEntry) -> int:
        with self._lock:
            self.log.append(entry)
            return self.snapshot_index + len(self.log) - 1
    
    def truncate_log(self, index: int):
        with self._lock:
            relative_index = index - self.snapshot_index
            if 0 <= relative_index < len(self.log):
                self.log = self.log[:relative_index + 1]
    
    def get_log_entries(self, start_idx: int) -> List[LogEntry]:
        with self._lock:
            relative_start = start_idx - self.snapshot_index
            if relative_start < 0:
                relative_start = 0
            if relative_start < len(self.log):
                return self.log[relative_start:]
            return []
    
    def get_log_entry(self, index: int) -> Optional[LogEntry]:
        with self._lock:
            relative_index = index - self.snapshot_index
            if 0 <= relative_index < len(self.log):
                return self.log[relative_index]
            return None
    
    def become_follower(self, term: int):
        with self._lock:
            self.state = NodeState.FOLLOWER
            self.current_term = term
            self.voted_for = None
            self.last_heartbeat = time.time()
            self.election_timeout = random.uniform(300, 500) / 1000
    
    def become_candidate(self):
        with self._lock:
            self.state = NodeState.CANDIDATE
            self.current_term += 1
            self.voted_for = self.node_id
            self.last_heartbeat = time.time()
            self.election_timeout = random.uniform(300, 500) / 1000
    
    def become_leader(self):
        with self._lock:
            self.state = NodeState.LEADER
            self.leader_id = self.node_id
            
            last_log_index = self.get_last_log_index()
            for peer in self.peers:
                self.next_index[peer] = last_log_index + 1
                self.match_index[peer] = 0
    
    def apply_committed(self):
        with self._lock:
            while self.last_applied < self.commit_index:
                self.last_applied += 1
                relative_index = self.last_applied - self.snapshot_index
                if relative_index >= 0 and relative_index < len(self.log):
                    entry = self.log[relative_index]
                    if self.state_machine_callback:
                        self.state_machine_callback(entry.command)
    
    def should_snapshot(self) -> bool:
        with self._lock:
            total_logs = self.snapshot_index + len(self.log)
            return total_logs >= self.SNAPSHOT_THRESHOLD
    
    def create_snapshot(self, index: int = None) -> bool:
        with self._snapshot_lock:
            with self._lock:
                if index is None:
                    index = min(self.last_applied, self.commit_index)
                
                if index <= self.snapshot_index:
                    return False
                
                relative_index = index - self.snapshot_index
                if relative_index < 0 or relative_index >= len(self.log):
                    return False
                
                snapshot_term = self.log[relative_index].term
                
                if not self.snapshot_callback:
                    return False
                
                try:
                    snapshot_data = self.snapshot_callback()
                except Exception as e:
                    print(f"Error creating snapshot data: {e}")
                    return False
                
                snapshot = Snapshot(index, snapshot_term, snapshot_data)
                
                if not self._save_snapshot(snapshot):
                    return False
                
                self.log = self.log[relative_index:]
                if not self.log:
                    self.log = [LogEntry(snapshot_term, {})]
                
                self.snapshot_index = index
                self.snapshot_term = snapshot_term
                
                print(f"[{self.node_id}] Created snapshot at index {index}, term {snapshot_term}, remaining logs: {len(self.log)}")
                return True
    
    def _save_snapshot(self, snapshot: Snapshot) -> bool:
        try:
            snapshot_file = os.path.join(self.snapshot_dir, f"snapshot_{snapshot.last_index}.dat")
            with open(snapshot_file, 'wb') as f:
                pickle.dump({
                    'last_index': snapshot.last_index,
                    'last_term': snapshot.last_term,
                    'data': snapshot.data
                }, f)
            
            metadata_file = os.path.join(self.snapshot_dir, "metadata.json")
            with open(metadata_file, 'w') as f:
                json.dump({
                    'latest_snapshot_index': snapshot.last_index,
                    'latest_snapshot_term': snapshot.last_term
                }, f, indent=2)
            
            self._cleanup_old_snapshots(snapshot.last_index)
            return True
        except Exception as e:
            print(f"Error saving snapshot: {e}")
            return False
    
    def _cleanup_old_snapshots(self, keep_index: int):
        try:
            for filename in os.listdir(self.snapshot_dir):
                if filename.startswith("snapshot_") and filename.endswith(".dat"):
                    try:
                        idx = int(filename.split("_")[1].split(".")[0])
                        if idx < keep_index - 2000:
                            filepath = os.path.join(self.snapshot_dir, filename)
                            os.remove(filepath)
                    except:
                        pass
        except Exception as e:
            print(f"Error cleaning up old snapshots: {e}")
    
    def load_latest_snapshot(self) -> bool:
        with self._snapshot_lock:
            try:
                metadata_file = os.path.join(self.snapshot_dir, "metadata.json")
                if not os.path.exists(metadata_file):
                    return False
                
                with open(metadata_file, 'r') as f:
                    metadata = json.load(f)
                
                latest_index = metadata['latest_snapshot_index']
                snapshot_file = os.path.join(self.snapshot_dir, f"snapshot_{latest_index}.dat")
                
                if not os.path.exists(snapshot_file):
                    return False
                
                with open(snapshot_file, 'rb') as f:
                    data = pickle.load(f)
                
                if self.restore_callback:
                    self.restore_callback(data['data'])
                
                with self._lock:
                    self.snapshot_index = data['last_index']
                    self.snapshot_term = data['last_term']
                    self.last_applied = data['last_index']
                    self.commit_index = data['last_index']
                
                print(f"[{self.node_id}] Loaded snapshot at index {data['last_index']}, term {data['last_term']}")
                return True
            except Exception as e:
                print(f"Error loading snapshot: {e}")
                return False
    
    def install_snapshot(self, last_index: int, last_term: int, data: bytes) -> bool:
        with self._snapshot_lock:
            with self._lock:
                if last_index <= self.snapshot_index:
                    return False
                
                if self.restore_callback:
                    try:
                        self.restore_callback(data)
                    except Exception as e:
                        print(f"Error restoring from snapshot: {e}")
                        return False
                
                snapshot = Snapshot(last_index, last_term, data)
                if not self._save_snapshot(snapshot):
                    return False
                
                self.snapshot_index = last_index
                self.snapshot_term = last_term
                self.last_applied = last_index
                self.commit_index = last_index
                
                self.log = [LogEntry(last_term, {})]
                
                print(f"[{self.node_id}] Installed snapshot at index {last_index}, term {last_term}")
                return True
    
    def get_snapshot_info(self) -> tuple:
        with self._lock:
            return (self.snapshot_index, self.snapshot_term)
    
    def get_state(self) -> NodeState:
        with self._lock:
            return self.state
    
    def get_current_term(self) -> int:
        with self._lock:
            return self.current_term
    
    def get_voted_for(self) -> Optional[str]:
        with self._lock:
            return self.voted_for
    
    def set_voted_for(self, candidate_id: str):
        with self._lock:
            self.voted_for = candidate_id
    
    def get_commit_index(self) -> int:
        with self._lock:
            return self.commit_index
    
    def set_commit_index(self, index: int):
        with self._lock:
            self.commit_index = index
    
    def get_last_applied(self) -> int:
        with self._lock:
            return self.last_applied
    
    def get_next_index(self, peer_id: str) -> int:
        with self._lock:
            return self.next_index.get(peer_id, self.snapshot_index + 1)
    
    def set_next_index(self, peer_id: str, index: int):
        with self._lock:
            self.next_index[peer_id] = index
    
    def get_match_index(self, peer_id: str) -> int:
        with self._lock:
            return self.match_index.get(peer_id, 0)
    
    def set_match_index(self, peer_id: str, index: int):
        with self._lock:
            self.match_index[peer_id] = index
    
    def get_all_match_indices(self) -> List[int]:
        with self._lock:
            return [self.match_index.get(p, 0) for p in self.peers]
    
    def get_leader_id(self) -> Optional[str]:
        with self._lock:
            return self.leader_id
    
    def set_leader_id(self, leader_id: str):
        with self._lock:
            self.leader_id = leader_id
    
    def get_snapshot_stats(self) -> dict:
        with self._lock:
            return {
                "snapshot_index": self.snapshot_index,
                "snapshot_term": self.snapshot_term,
                "log_count": len(self.log),
                "total_logs": self.snapshot_index + len(self.log),
                "threshold": self.SNAPSHOT_THRESHOLD
            }

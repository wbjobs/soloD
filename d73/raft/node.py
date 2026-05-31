import threading
import time
import logging
from typing import Dict, Optional
from .state import RaftState, NodeState, LogEntry

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class RaftNode:
    def __init__(self, node_id: str, peers: Dict[str, str], data_dir: str):
        self.node_id = node_id
        self.peers = peers
        self.peer_ids = list(peers.keys())
        self.data_dir = data_dir
        
        self.raft_state = RaftState(node_id, self.peer_ids, data_dir)
        
        self.running = False
        self.worker_thread: Optional[threading.Thread] = None
        
        self.rpc_clients = {}
        self.state_machine = None
        
        self._last_heartbeat_send = 0
        self._heartbeat_interval = 0.1
        
        self._election_lock = threading.Lock()
        self._election_in_progress = False
        
        self._last_snapshot_check = 0
        self._snapshot_check_interval = 5
    
    def set_state_machine(self, state_machine):
        self.state_machine = state_machine
        self.raft_state.state_machine_callback = state_machine.apply
        self.raft_state.snapshot_callback = state_machine.create_snapshot
        self.raft_state.restore_callback = state_machine.restore_snapshot
    
    def set_rpc_clients(self, clients):
        self.rpc_clients = clients
    
    def load_snapshot(self) -> bool:
        return self.raft_state.load_latest_snapshot()
    
    def start(self):
        self.running = True
        self.worker_thread = threading.Thread(target=self._main_loop, daemon=True)
        self.worker_thread.start()
        logger.info(f"Node {self.node_id} started")
    
    def stop(self):
        self.running = False
        if self.worker_thread:
            self.worker_thread.join()
        logger.info(f"Node {self.node_id} stopped")
    
    def _main_loop(self):
        while self.running:
            try:
                self._check_snapshot()
                
                current_state = self.raft_state.get_state()
                if current_state == NodeState.LEADER:
                    self._leader_work()
                elif current_state == NodeState.CANDIDATE:
                    self._candidate_work()
                else:
                    self._follower_work()
            except Exception as e:
                logger.error(f"Error in main loop: {e}")
                time.sleep(0.1)
    
    def _follower_work(self):
        if self.raft_state.is_election_timeout():
            logger.info(f"Node {self.node_id} election timeout, becoming candidate")
            self.raft_state.become_candidate()
        time.sleep(0.01)
    
    def _candidate_work(self):
        if self.raft_state.is_election_timeout():
            logger.info(f"Node {self.node_id} election timeout, starting new election")
            self.raft_state.become_candidate()
            self._start_election()
        time.sleep(0.01)
    
    def _leader_work(self):
        now = time.time()
        if now - self._last_heartbeat_send >= self._heartbeat_interval:
            self._send_heartbeats()
            self._last_heartbeat_send = now
        
        self._check_commit()
        self.raft_state.apply_committed()
        time.sleep(0.01)
    
    def _check_snapshot(self):
        now = time.time()
        if now - self._last_snapshot_check >= self._snapshot_check_interval:
            self._last_snapshot_check = now
            if self.raft_state.should_snapshot():
                logger.info(f"Node {self.node_id} threshold reached, creating snapshot")
                self.raft_state.create_snapshot()
    
    def _start_election(self):
        with self._election_lock:
            if self._election_in_progress:
                return
            self._election_in_progress = True
        
        def run_election():
            try:
                current_term = self.raft_state.get_current_term()
                last_log_index = self.raft_state.get_last_log_index()
                last_log_term = self.raft_state.get_last_log_term()
                
                logger.info(f"Node {self.node_id} starting election for term {current_term}")
                
                votes_received = 1
                votes_lock = threading.Lock()
                
                def request_vote_from_peer(peer_id):
                    nonlocal votes_received
                    try:
                        if peer_id in self.rpc_clients:
                            response = self.rpc_clients[peer_id].request_vote(
                                term=current_term,
                                candidate_id=self.node_id,
                                last_log_index=last_log_index,
                                last_log_term=last_log_term
                            )
                            
                            if response.term > current_term:
                                self.raft_state.become_follower(response.term)
                                return
                            
                            if response.vote_granted:
                                with votes_lock:
                                    votes_received += 1
                    except Exception as e:
                        logger.debug(f"Failed to request vote from {peer_id}: {e}")
                
                threads = []
                for peer_id in self.peer_ids:
                    t = threading.Thread(target=request_vote_from_peer, args=(peer_id,), daemon=True)
                    t.start()
                    threads.append(t)
                
                for t in threads:
                    t.join(timeout=0.5)
                
                majority = (len(self.peer_ids) + 1) // 2 + 1
                if votes_received >= majority and self.raft_state.get_state() == NodeState.CANDIDATE:
                    logger.info(f"Node {self.node_id} elected leader with {votes_received} votes")
                    self.raft_state.become_leader()
                    self._send_heartbeats()
            finally:
                with self._election_lock:
                    self._election_in_progress = False
        
        threading.Thread(target=run_election, daemon=True).start()
    
    def _send_heartbeats(self):
        for peer_id in self.peer_ids:
            threading.Thread(
                target=self._replicate_log_to_peer,
                args=(peer_id,),
                daemon=True
            ).start()
    
    def _replicate_log_to_peer(self, peer_id: str):
        if peer_id not in self.rpc_clients:
            return
        
        try:
            current_term = self.raft_state.get_current_term()
            next_idx = self.raft_state.get_next_index(peer_id)
            prev_log_index = next_idx - 1
            prev_log_term = self.raft_state.get_log_term(prev_log_index)
            
            entries = self.raft_state.get_log_entries(next_idx)
            leader_commit = self.raft_state.get_commit_index()
            
            response = self.rpc_clients[peer_id].append_entries(
                term=current_term,
                leader_id=self.node_id,
                prev_log_index=prev_log_index,
                prev_log_term=prev_log_term,
                entries=entries,
                leader_commit=leader_commit
            )
            
            if response.term > current_term:
                self.raft_state.become_follower(response.term)
                return
            
            if response.success:
                self.raft_state.set_next_index(peer_id, next_idx + len(entries))
                self.raft_state.set_match_index(peer_id, next_idx + len(entries) - 1)
            else:
                self.raft_state.set_next_index(peer_id, max(1, next_idx - 1))
                
        except Exception as e:
            logger.debug(f"Failed to replicate log to {peer_id}: {e}")
    
    def _check_commit(self):
        match_indices = sorted(self.raft_state.get_all_match_indices(), reverse=True)
        n = len(self.peer_ids)
        
        if n > 0:
            majority_idx = (n - 1) // 2
            new_commit = match_indices[majority_idx]
            current_commit = self.raft_state.get_commit_index()
            current_term = self.raft_state.get_current_term()
            
            if new_commit > current_commit:
                if self.raft_state.get_log_term(new_commit) == current_term:
                    self.raft_state.set_commit_index(new_commit)
                    logger.info(f"Leader {self.node_id} commit index updated to {new_commit}")
    
    def handle_request_vote(self, term: int, candidate_id: str,
                           last_log_index: int, last_log_term: int):
        with self.raft_state._lock:
            current_term = self.raft_state.current_term
            
            if term > current_term:
                self.raft_state.state = NodeState.FOLLOWER
                self.raft_state.current_term = term
                self.raft_state.voted_for = None
                self.raft_state.last_heartbeat = time.time()
                self.raft_state.election_timeout = self.raft_state.election_timeout = time.time()
            
            vote_granted = False
            
            if term >= self.raft_state.current_term:
                voted_for = self.raft_state.voted_for
                if voted_for is None or voted_for == candidate_id:
                    last_term = self.raft_state.log[-1].term if self.raft_state.log else self.raft_state.snapshot_term
                    last_idx = self.raft_state.snapshot_index + len(self.raft_state.log) - 1
                    
                    log_ok = (last_log_term > last_term or 
                             (last_log_term == last_term and last_log_index >= last_idx))
                    
                    if log_ok:
                        self.raft_state.voted_for = candidate_id
                        vote_granted = True
                        self.raft_state.last_heartbeat = time.time()
            
            return {
                "term": self.raft_state.current_term,
                "vote_granted": vote_granted
            }
    
    def handle_append_entries(self, term: int, leader_id: str,
                             prev_log_index: int, prev_log_term: int,
                             entries: list, leader_commit: int):
        with self.raft_state._lock:
            self.raft_state.last_heartbeat = time.time()
            current_term = self.raft_state.current_term
            
            if term > current_term:
                self.raft_state.state = NodeState.FOLLOWER
                self.raft_state.current_term = term
                self.raft_state.voted_for = None
            
            if term < self.raft_state.current_term:
                return {
                    "term": self.raft_state.current_term,
                    "success": False
                }
            
            self.raft_state.leader_id = leader_id
            self.raft_state.state = NodeState.FOLLOWER
            
            if prev_log_index < self.raft_state.snapshot_index:
                return {
                    "term": self.raft_state.current_term,
                    "success": False
                }
            
            log_len = self.raft_state.snapshot_index + len(self.raft_state.log)
            if prev_log_index >= log_len:
                return {
                    "term": self.raft_state.current_term,
                    "success": False
                }
            
            if prev_log_index > self.raft_state.snapshot_index:
                relative_idx = prev_log_index - self.raft_state.snapshot_index
                if relative_idx < len(self.raft_state.log) and self.raft_state.log[relative_idx].term != prev_log_term:
                    self.raft_state.log = self.raft_state.log[:relative_idx]
                    return {
                        "term": self.raft_state.current_term,
                        "success": False
                    }
            
            for i, entry in enumerate(entries):
                idx = prev_log_index + 1 + i
                relative_idx = idx - self.raft_state.snapshot_index
                if relative_idx < len(self.raft_state.log):
                    if self.raft_state.log[relative_idx].term != entry.term:
                        self.raft_state.log = self.raft_state.log[:relative_idx]
                        self.raft_state.log.append(entry)
                else:
                    self.raft_state.log.append(entry)
            
            if leader_commit > self.raft_state.commit_index:
                last_log_idx = self.raft_state.snapshot_index + len(self.raft_state.log) - 1
                self.raft_state.commit_index = min(leader_commit, last_log_idx)
                callback = self.raft_state.state_machine_callback
                if callback:
                    while self.raft_state.last_applied < self.raft_state.commit_index:
                        self.raft_state.last_applied += 1
                        relative_idx = self.raft_state.last_applied - self.raft_state.snapshot_index
                        if relative_idx >= 0 and relative_idx < len(self.raft_state.log):
                            entry = self.raft_state.log[relative_idx]
                            callback(entry.command)
            
            return {
                "term": self.raft_state.current_term,
                "success": True
            }
    
    def propose_command(self, command: dict) -> bool:
        if self.raft_state.get_state() != NodeState.LEADER:
            return False
        
        entry = LogEntry(self.raft_state.get_current_term(), command)
        self.raft_state.append_log(entry)
        return True
    
    def get_leader(self) -> Optional[str]:
        return self.raft_state.get_leader_id()
    
    def is_leader(self) -> bool:
        return self.raft_state.get_state() == NodeState.LEADER
    
    def get_snapshot_stats(self) -> dict:
        return self.raft_state.get_snapshot_stats()

import grpc
import json
import logging
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from proto import raft_pb2, raft_pb2_grpc

logger = logging.getLogger(__name__)


class RaftClient:
    def __init__(self, address: str):
        self.address = address
        self.channel = None
        self.stub = None
    
    def connect(self):
        self.channel = grpc.insecure_channel(self.address)
        self.stub = raft_pb2_grpc.RaftServiceStub(self.channel)
    
    def close(self):
        if self.channel:
            self.channel.close()
    
    def request_vote(self, term: int, candidate_id: str,
                    last_log_index: int, last_log_term: int):
        request = raft_pb2.RequestVoteRequest(
            term=term,
            candidate_id=candidate_id,
            last_log_index=last_log_index,
            last_log_term=last_log_term
        )
        return self.stub.RequestVote(request)
    
    def append_entries(self, term: int, leader_id: str,
                      prev_log_index: int, prev_log_term: int,
                      entries: list, leader_commit: int):
        proto_entries = []
        for entry in entries:
            proto_entries.append(raft_pb2.LogEntry(
                term=entry.term,
                command=json.dumps(entry.command)
            ))
        
        request = raft_pb2.AppendEntriesRequest(
            term=term,
            leader_id=leader_id,
            prev_log_index=prev_log_index,
            prev_log_term=prev_log_term,
            entries=proto_entries,
            leader_commit=leader_commit
        )
        return self.stub.AppendEntries(request)


def create_clients(peers: dict) -> dict:
    clients = {}
    for node_id, address in peers.items():
        client = RaftClient(address)
        client.connect()
        clients[node_id] = client
    return clients

import grpc
import json
import logging
from concurrent import futures
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from proto import raft_pb2, raft_pb2_grpc
from raft.state import LogEntry

logger = logging.getLogger(__name__)


class RaftServiceServicer(raft_pb2_grpc.RaftServiceServicer):
    def __init__(self, raft_node):
        self.raft_node = raft_node
    
    def RequestVote(self, request, context):
        result = self.raft_node.handle_request_vote(
            term=request.term,
            candidate_id=request.candidate_id,
            last_log_index=request.last_log_index,
            last_log_term=request.last_log_term
        )
        return raft_pb2.RequestVoteResponse(
            term=result["term"],
            vote_granted=result["vote_granted"]
        )
    
    def AppendEntries(self, request, context):
        entries = []
        for entry in request.entries:
            command = json.loads(entry.command)
            entries.append(LogEntry(term=entry.term, command=command))
        
        result = self.raft_node.handle_append_entries(
            term=request.term,
            leader_id=request.leader_id,
            prev_log_index=request.prev_log_index,
            prev_log_term=request.prev_log_term,
            entries=entries,
            leader_commit=request.leader_commit
        )
        return raft_pb2.AppendEntriesResponse(
            term=result["term"],
            success=result["success"]
        )


def serve(raft_node, port: str):
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    servicer = RaftServiceServicer(raft_node)
    raft_pb2_grpc.add_RaftServiceServicer_to_server(servicer, server)
    server.add_insecure_port(f"[::]:{port}")
    server.start()
    logger.info(f"gRPC server started on port {port}")
    return server

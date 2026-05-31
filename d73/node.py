import os
import sys
import time
import logging
import uvicorn
import threading

from raft.node import RaftNode
from storage.leveldb_store import LevelDBStore, KVStateMachine
from rpc.server import serve as serve_grpc
from rpc.client import create_clients
from http_server.api import app, init_api
from config import get_peers, get_node_config, DATA_DIR

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class KVNode:
    def __init__(self, node_id: str):
        self.node_id = node_id
        self.config = get_node_config(node_id)
        self.peers = get_peers(node_id)
        
        self.data_dir = os.path.join(DATA_DIR, node_id)
        os.makedirs(self.data_dir, exist_ok=True)
        
        self.store = LevelDBStore(os.path.join(self.data_dir, "db"))
        self.state_machine = KVStateMachine(self.store)
        
        self.raft_node = RaftNode(node_id, self.peers, self.data_dir)
        self.raft_node.set_state_machine(self.state_machine)
        
        self.grpc_server = None
        self.http_server_thread = None
        self._stop_event = threading.Event()
    
    def start(self):
        logger.info(f"Starting node {self.node_id}...")
        
        self.raft_node.load_snapshot()
        
        self.grpc_server = serve_grpc(self.raft_node, self.config["grpc_port"])
        logger.info(f"gRPC server started on port {self.config['grpc_port']}")
        
        time.sleep(2)
        
        clients = create_clients(self.peers)
        self.raft_node.set_rpc_clients(clients)
        logger.info("gRPC clients connected")
        
        time.sleep(1)
        
        self.raft_node.start()
        
        init_api(self.raft_node, self.state_machine)
        
        self.http_server_thread = threading.Thread(
            target=self._run_http_server,
            daemon=True
        )
        self.http_server_thread.start()
        
        logger.info(f"Node {self.node_id} started successfully!")
        logger.info(f"  HTTP port: {self.config['http_port']}")
        logger.info(f"  gRPC port: {self.config['grpc_port']}")
        
        stats = self.raft_node.get_snapshot_stats()
        logger.info(f"  Snapshot index: {stats['snapshot_index']}")
        logger.info(f"  Current log count: {stats['log_count']}")
    
    def _run_http_server(self):
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=self.config["http_port"],
            log_level="warning"
        )
    
    def stop(self):
        logger.info(f"Stopping node {self.node_id}...")
        self._stop_event.set()
        self.raft_node.stop()
        if self.grpc_server:
            self.grpc_server.stop(0)
        logger.info(f"Node {self.node_id} stopped")
    
    def wait_for_termination(self):
        self._stop_event.wait()


def main():
    if len(sys.argv) < 2:
        print("Usage: python node.py <node_id>")
        print("Available nodes: node1, node2, node3")
        sys.exit(1)
    
    node_id = sys.argv[1]
    if node_id not in ["node1", "node2", "node3"]:
        print(f"Invalid node_id: {node_id}")
        print("Available nodes: node1, node2, node3")
        sys.exit(1)
    
    node = KVNode(node_id)
    node.start()
    
    try:
        node.wait_for_termination()
    except KeyboardInterrupt:
        node.stop()


if __name__ == "__main__":
    main()

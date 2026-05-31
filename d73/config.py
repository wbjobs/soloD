import os

BASE_DIR = os.path.dirname(__file__)
DATA_DIR = os.path.join(BASE_DIR, "data")

NODES_CONFIG = {
    "node1": {
        "grpc_port": "50051",
        "http_port": 8001,
        "grpc_address": "localhost:50051"
    },
    "node2": {
        "grpc_port": "50052",
        "http_port": 8002,
        "grpc_address": "localhost:50052"
    },
    "node3": {
        "grpc_port": "50053",
        "http_port": 8003,
        "grpc_address": "localhost:50053"
    }
}


def get_peers(node_id: str) -> dict:
    peers = {}
    for nid, config in NODES_CONFIG.items():
        if nid != node_id:
            peers[nid] = config["grpc_address"]
    return peers


def get_node_config(node_id: str) -> dict:
    return NODES_CONFIG.get(node_id, {})

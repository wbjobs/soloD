from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import logging
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

logger = logging.getLogger(__name__)

app = FastAPI()
raft_node = None
state_machine = None


class PutRequest(BaseModel):
    key: str
    value: dict


def init_api(node, machine):
    global raft_node, state_machine
    raft_node = node
    state_machine = machine


@app.get("/get/{key}")
async def get_key(key: str):
    if state_machine is None:
        raise HTTPException(status_code=500, detail="Server not initialized")
    
    value = state_machine.get(key)
    if value is None:
        raise HTTPException(status_code=404, detail="Key not found")
    return {"key": key, "value": value}


@app.post("/put")
async def put_key(request: PutRequest):
    if raft_node is None:
        raise HTTPException(status_code=500, detail="Server not initialized")
    
    if not raft_node.is_leader():
        leader = raft_node.get_leader()
        raise HTTPException(
            status_code=307,
            detail=f"Not leader. Please redirect to leader: {leader}"
        )
    
    command = {
        "op": "put",
        "key": request.key,
        "value": request.value
    }
    
    success = raft_node.propose_command(command)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to propose command")
    
    return {"status": "ok", "message": "Command proposed"}


@app.get("/status")
async def get_status():
    if raft_node is None:
        raise HTTPException(status_code=500, detail="Server not initialized")
    
    snapshot_stats = raft_node.get_snapshot_stats()
    return {
        "node_id": raft_node.node_id,
        "is_leader": raft_node.is_leader(),
        "leader_id": raft_node.get_leader(),
        "snapshot": snapshot_stats
    }


@app.post("/snapshot/force")
async def force_snapshot():
    if raft_node is None:
        raise HTTPException(status_code=500, detail="Server not initialized")
    
    success = raft_node.raft_state.create_snapshot()
    if success:
        stats = raft_node.get_snapshot_stats()
        return {"status": "ok", "message": "Snapshot created", "stats": stats}
    else:
        return {"status": "error", "message": "Failed to create snapshot"}

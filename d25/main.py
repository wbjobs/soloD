from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List
from contextlib import asynccontextmanager
import json

from task_queue import task_queue, TaskStatus

class NoiseConfig(BaseModel):
    type: str = Field(default="none", description="Noise type: 'none', 'bit_flip', 'depolarizing'")
    probability: float = Field(default=0.0, ge=0.0, le=1.0, description="Noise probability")
    apply_after_gates: bool = Field(default=True, description="Apply noise after each gate")

class GateInfo(BaseModel):
    name: str
    qubits: List[int]
    params: Optional[Dict[str, Any]] = Field(default_factory=dict)

class CircuitRequest(BaseModel):
    num_qubits: int = Field(ge=1, le=10, description="Number of qubits (1-10)")
    gates: List[GateInfo]
    noise: Optional[NoiseConfig] = Field(default=None, description="Noise configuration")
    shots: int = Field(default=1024, ge=1, le=8192, description="Number of measurement shots")

class TaskResponse(BaseModel):
    task_id: str
    status: str
    message: str

class ProbabilityItem(BaseModel):
    state: str
    probability: float

class CountItem(BaseModel):
    state: str
    count: int

class TaskStatusResponse(BaseModel):
    task_id: str
    status: str
    created_at: str
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    num_qubits: Optional[int] = None
    probabilities: Optional[List[ProbabilityItem]] = None
    counts: Optional[List[CountItem]] = None
    shots: Optional[int] = None
    noise: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    await task_queue.start()
    yield
    await task_queue.stop()

app = FastAPI(
    title="Quantum Circuit Simulator API",
    description="API for simulating quantum circuits with up to 10 qubits and noise models",
    version="1.1.0",
    lifespan=lifespan
)

@app.post("/simulate", response_model=TaskResponse, summary="Submit a quantum circuit simulation task")
async def submit_simulation(circuit: CircuitRequest):
    try:
        circuit_dict = circuit.model_dump()
        task_id = await task_queue.create_task(circuit_dict)
        
        return TaskResponse(
            task_id=task_id,
            status=TaskStatus.PENDING,
            message="Simulation task submitted successfully"
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/status/{task_id}", response_model=TaskStatusResponse, summary="Get simulation task status")
async def get_status(task_id: str):
    task = task_queue.get_task_status(task_id)
    
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    
    probabilities_list = None
    counts_list = None
    
    if task.result:
        if 'probabilities' in task.result:
            probabilities_list = [
                ProbabilityItem(state=state, probability=prob)
                for state, prob in task.result['probabilities'].items()
            ]
        
        if 'counts' in task.result:
            counts_list = [
                CountItem(state=state, count=count)
                for state, count in task.result['counts'].items()
            ]
    
    return TaskStatusResponse(
        task_id=task.task_id,
        status=task.status.value,
        created_at=task.created_at.isoformat(),
        started_at=task.started_at.isoformat() if task.started_at else None,
        completed_at=task.completed_at.isoformat() if task.completed_at else None,
        num_qubits=task.result.get('num_qubits') if task.result else None,
        probabilities=probabilities_list,
        counts=counts_list,
        shots=task.result.get('shots') if task.result else None,
        noise=task.result.get('noise') if task.result else None,
        error=task.error
    )

@app.get("/health", summary="Health check endpoint")
async def health_check():
    return {"status": "healthy", "service": "quantum-simulator"}

@app.get("/noise/types", summary="Get available noise types")
async def get_noise_types():
    return {
        "noise_types": [
            {"name": "none", "description": "No noise - ideal simulation"},
            {"name": "bit_flip", "description": "Bit flip noise - random X gate application"},
            {"name": "depolarizing", "description": "Depolarizing noise - random X/Y/Z gate application"}
        ]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

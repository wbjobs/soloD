import asyncio
import uuid
import gc
from typing import Dict, Any, Optional
from enum import Enum
from dataclasses import dataclass, field
from datetime import datetime

class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"

@dataclass
class SimulationTask:
    task_id: str
    status: TaskStatus
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    circuit_data: Dict[str, Any] = field(default_factory=dict)
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

class TaskQueue:
    def __init__(self, max_tasks: int = 100):
        self.tasks: Dict[str, SimulationTask] = {}
        self._queue: asyncio.Queue = asyncio.Queue()
        self._worker_task: Optional[asyncio.Task] = None
        self._max_tasks = max_tasks
    
    async def start(self):
        if self._worker_task is None:
            self._worker_task = asyncio.create_task(self._worker())
    
    async def stop(self):
        if self._worker_task:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
            self._worker_task = None
    
    async def create_task(self, circuit_data: Dict[str, Any]) -> str:
        if len(self.tasks) >= self._max_tasks:
            self._cleanup_old_tasks()
        
        task_id = str(uuid.uuid4())
        task = SimulationTask(
            task_id=task_id,
            status=TaskStatus.PENDING,
            created_at=datetime.now(),
            circuit_data=circuit_data
        )
        self.tasks[task_id] = task
        await self._queue.put(task_id)
        return task_id
    
    def get_task_status(self, task_id: str) -> Optional[SimulationTask]:
        return self.tasks.get(task_id)
    
    def _cleanup_old_tasks(self):
        cutoff = datetime.now() - datetime.timedelta(minutes=30)
        tasks_to_remove = [
            tid for tid, task in self.tasks.items()
            if task.completed_at and task.completed_at < cutoff
        ]
        for tid in tasks_to_remove:
            del self.tasks[tid]
        if tasks_to_remove:
            gc.collect()
    
    async def _worker(self):
        while True:
            try:
                task_id = await self._queue.get()
                task = self.tasks.get(task_id)
                
                if not task:
                    self._queue.task_done()
                    continue
                
                task.status = TaskStatus.RUNNING
                task.started_at = datetime.now()
                
                try:
                    from compiler import compile_circuit
                    from simulator import simulate_circuit
                    
                    circuit = compile_circuit(task.circuit_data)
                    shots = task.circuit_data.get('shots', 1024)
                    result = simulate_circuit(circuit, shots)
                    
                    task.result = result
                    task.status = TaskStatus.COMPLETED
                except Exception as e:
                    task.status = TaskStatus.FAILED
                    task.error = str(e)
                finally:
                    task.completed_at = datetime.now()
                    self._queue.task_done()
                    gc.collect()
                    
            except asyncio.CancelledError:
                break
            except Exception as e:
                print(f"Worker error: {e}")
                continue

task_queue = TaskQueue()

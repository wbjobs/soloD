from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
import uuid
import base64
from typing import Dict, Any

router = APIRouter()

redis_client = None
mongodb_store = None

def init_routes(redis, mongodb):
    global redis_client, mongodb_store
    redis_client = redis
    mongodb_store = mongodb

@router.post("/task")
async def submit_task(
    text: str = Form(...),
    image: UploadFile = File(...)
) -> Dict[str, Any]:
    task_id = str(uuid.uuid4())
    
    image_data = await image.read()
    image_base64 = base64.b64encode(image_data).decode("utf-8")
    
    task_data = {
        "text": text,
        "image": image_base64
    }
    
    redis_client.push_task(task_id, task_data)
    redis_client.set_task_status(task_id, "pending")
    
    return {
        "task_id": task_id,
        "status": "pending",
        "message": "Task submitted successfully"
    }

@router.get("/result/{task_id}")
async def get_result(task_id: str) -> Dict[str, Any]:
    status = redis_client.get_task_status(task_id)
    
    if status is None:
        result = mongodb_store.get_result(task_id)
        if result is None:
            raise HTTPException(status_code=404, detail="Task not found")
        return {
            "task_id": task_id,
            "status": "completed",
            "result": result["result"]
        }
    
    if status == "pending" or status == "processing":
        return {
            "task_id": task_id,
            "status": status,
            "message": "Task is still processing"
        }
    
    result = mongodb_store.get_result(task_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Result not found")
        
    return {
        "task_id": task_id,
        "status": "completed",
        "result": result["result"]
    }

@router.get("/queue/stats")
async def get_queue_stats():
    return redis_client.get_queue_length()

@router.get("/cache/stats")
async def get_cache_stats():
    return redis_client.get_cache_stats()

@router.delete("/cache/clear")
async def clear_cache():
    cleared = redis_client.clear_cache()
    return {"cleared_count": cleared, "message": f"Cleared {cleared} cache entries"}

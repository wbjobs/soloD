from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from ..models.database import get_db
from ..models.schemas import (
    UploadInitRequest,
    UploadInitResponse,
    ChunkUploadResponse,
    UploadCompleteRequest,
    UploadCompleteResponse
)
from ..services.upload_service import init_upload, save_chunk
from ..services.task_queue import process_upload_task, task_manager, TaskStatus

router = APIRouter(prefix="/api/upload", tags=["upload"])

@router.post("/init", response_model=UploadInitResponse)
async def initialize_upload(
    request: UploadInitRequest,
    db: AsyncSession = Depends(get_db)
):
    upload_id, chunk_size = await init_upload(
        db,
        request.file_name,
        request.file_size,
        request.total_chunks
    )
    return {"upload_id": upload_id, "chunk_size": chunk_size}

@router.post("/chunk", response_model=ChunkUploadResponse)
async def upload_chunk(
    upload_id: str = Form(...),
    chunk_index: int = Form(...),
    chunk: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    chunk_data = await chunk.read()
    success = await save_chunk(db, upload_id, chunk_index, chunk_data)
    
    if not success:
        raise HTTPException(status_code=404, detail="Upload session not found")
    
    return {"received": True, "chunk_index": chunk_index}

@router.post("/complete")
async def finish_upload(
    request: UploadCompleteRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    await task_manager.create_task(request.upload_id, request.upload_id)
    background_tasks.add_task(process_upload_task, db, request.upload_id, request.file_hash)
    
    return {
        "success": True,
        "upload_id": request.upload_id,
        "message": "Processing started"
    }

@router.get("/status/{upload_id}")
async def get_upload_status(upload_id: str):
    task = await task_manager.get_task_status(upload_id)
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return {
        "upload_id": upload_id,
        "status": task["status"],
        "progress": task["progress"],
        "error": task["error"],
        "result": task["result"]
    }

import asyncio
import os
import shutil
from datetime import datetime, timedelta
from typing import Dict, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from geoalchemy2.functions import ST_MakePoint
from .fits_service import extract_fits_metadata, calculate_sha256
from .fits_compression import compress_fits_to_fz, estimate_download_time, format_download_time
from ..models.database import UploadSession, Observation, settings
from ..models.schemas import ObservationMetadata

class TaskStatus:
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

class UploadTaskManager:
    def __init__(self):
        self._tasks: Dict[str, dict] = {}
        self._lock = asyncio.Lock()
    
    async def create_task(self, upload_id: str, file_name: str) -> str:
        async with self._lock:
            self._tasks[upload_id] = {
                "status": TaskStatus.PENDING,
                "progress": 0,
                "file_name": file_name,
                "created_at": datetime.now(),
                "error": None,
                "result": None
            }
        return upload_id
    
    async def update_task_progress(self, upload_id: str, progress: int):
        async with self._lock:
            if upload_id in self._tasks:
                self._tasks[upload_id]["progress"] = progress
    
    async def set_task_status(self, upload_id: str, status: str, error: Optional[str] = None, result: Optional[dict] = None):
        async with self._lock:
            if upload_id in self._tasks:
                self._tasks[upload_id]["status"] = status
                self._tasks[upload_id]["error"] = error
                self._tasks[upload_id]["result"] = result
    
    async def get_task_status(self, upload_id: str) -> Optional[dict]:
        async with self._lock:
            return self._tasks.get(upload_id)
    
    async def cleanup_completed_tasks(self, older_than_hours: int = 24):
        cutoff = datetime.now().replace(tzinfo=None) - timedelta(hours=older_than_hours)
        async with self._lock:
            to_remove = [
                task_id for task_id, task in self._tasks.items()
                if task["status"] in [TaskStatus.COMPLETED, TaskStatus.FAILED]
                and task["created_at"].replace(tzinfo=None) < cutoff
            ]
            for task_id in to_remove:
                del self._tasks[task_id]

task_manager = UploadTaskManager()

async def process_upload_task(
    db: AsyncSession,
    upload_id: str,
    client_file_hash: str
):
    try:
        await task_manager.set_task_status(upload_id, TaskStatus.PROCESSING)

        result = await db.execute(select(UploadSession).where(UploadSession.id == upload_id))
        session = result.scalar_one_or_none()

        if not session:
            raise Exception("Upload session not found")

        if session.received_chunks != session.total_chunks:
            raise Exception("Not all chunks received")

        await task_manager.update_task_progress(upload_id, 10)

        # 检查文件是否已存在
        existing = await db.execute(select(Observation).where(Observation.file_hash == client_file_hash))
        existing_obs = existing.scalar_one_or_none()

        if existing_obs:
            shutil.rmtree(os.path.join(settings.CHUNK_DIR, upload_id))
            await task_manager.set_task_status(upload_id, TaskStatus.COMPLETED, result={
                "observation_id": existing_obs.id,
                "file_hash": existing_obs.file_hash
            })
            return

        await task_manager.update_task_progress(upload_id, 20)

        # 合并分块
        temp_path = os.path.join(settings.UPLOAD_DIR, f"{upload_id}_temp_{session.file_name}")
        chunk_dir = os.path.join(settings.CHUNK_DIR, upload_id)

        import aiofiles
        async with aiofiles.open(temp_path, 'wb') as outfile:
            for i in range(session.total_chunks):
                chunk_path = os.path.join(chunk_dir, f"chunk_{i}")
                async with aiofiles.open(chunk_path, 'rb') as infile:
                    await outfile.write(await infile.read())
                progress = 20 + int((i + 1) / session.total_chunks * 25)
                await task_manager.update_task_progress(upload_id, progress)

        await task_manager.update_task_progress(upload_id, 45)

        # 验证哈希
        server_file_hash = calculate_sha256(temp_path)

        if server_file_hash != client_file_hash:
            os.remove(temp_path)
            shutil.rmtree(chunk_dir)
            raise Exception("Hash mismatch")

        await task_manager.update_task_progress(upload_id, 50)

        # 提取元数据
        metadata = extract_fits_metadata(temp_path)

        await task_manager.update_task_progress(upload_id, 60)

        # 压缩FITS文件
        fz_filename = f"{upload_id}_{os.path.splitext(session.file_name)[0]}.fz"
        fz_path = os.path.join(settings.UPLOAD_DIR, fz_filename)

        compressed_path, compressed_size, compression_ratio = compress_fits_to_fz(
            temp_path,
            fz_path
        )

        # 删除临时文件
        os.remove(temp_path)

        await task_manager.update_task_progress(upload_id, 90)

        # 创建观测记录
        observation = Observation(
            file_hash=server_file_hash,
            file_name=fz_filename,
            file_size=compressed_size,
            observation_time=metadata['observation_time'],
            frequency_start=metadata['frequency_start'],
            frequency_end=metadata['frequency_end'],
            coordinate=ST_MakePoint(metadata['ra'], metadata['dec']),
            storage_path=compressed_path,
            is_compressed='true',
            original_size=session.file_size,
            compressed_size=compressed_size,
            compression_ratio=int(compression_ratio * 1000),
        )

        db.add(observation)
        await db.commit()
        await db.refresh(observation)

        shutil.rmtree(chunk_dir)

        await task_manager.update_task_progress(upload_id, 100)
        await task_manager.set_task_status(upload_id, TaskStatus.COMPLETED, result={
            "observation_id": observation.id,
            "file_hash": observation.file_hash,
            "metadata": {
                "ra": metadata['ra'],
                "dec": metadata['dec'],
                "observation_time": metadata['observation_time'].isoformat(),
                "is_compressed": True,
                "original_size": session.file_size,
                "compressed_size": compressed_size,
                "compression_ratio": compression_ratio
            }
        })

    except Exception as e:
        await task_manager.set_task_status(upload_id, TaskStatus.FAILED, error=str(e))
        raise

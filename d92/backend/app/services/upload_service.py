import os
import aiofiles
import shutil
from datetime import datetime, timedelta
from typing import Optional
from uuid import uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from geoalchemy2.functions import ST_MakePoint
from .fits_service import extract_fits_metadata, calculate_sha256
from ..models.database import UploadSession, Observation, settings
from ..models.schemas import ObservationMetadata

async def init_upload(
    db: AsyncSession,
    file_name: str,
    file_size: int,
    total_chunks: int
) -> tuple[str, int]:
    upload_id = str(uuid4())
    session_dir = os.path.join(settings.CHUNK_DIR, upload_id)
    os.makedirs(session_dir, exist_ok=True)
    
    session = UploadSession(
        id=upload_id,
        file_name=file_name,
        file_size=file_size,
        total_chunks=total_chunks,
        received_chunks=0,
        status='pending',
        expires_at=datetime.now() + timedelta(hours=24)
    )
    db.add(session)
    await db.commit()
    
    return upload_id, settings.CHUNK_SIZE

async def save_chunk(
    db: AsyncSession,
    upload_id: str,
    chunk_index: int,
    chunk_data: bytes
) -> bool:
    result = await db.execute(select(UploadSession).where(UploadSession.id == upload_id))
    session = result.scalar_one_or_none()
    
    if not session:
        return False
    
    chunk_path = os.path.join(settings.CHUNK_DIR, upload_id, f"chunk_{chunk_index}")
    
    async with aiofiles.open(chunk_path, 'wb') as f:
        await f.write(chunk_data)
    
    session.received_chunks += 1
    await db.commit()
    
    return True

async def complete_upload(
    db: AsyncSession,
    upload_id: str,
    client_file_hash: str
) -> Optional[ObservationMetadata]:
    result = await db.execute(select(UploadSession).where(UploadSession.id == upload_id))
    session = result.scalar_one_or_none()
    
    if not session:
        return None
    
    if session.received_chunks != session.total_chunks:
        return None
    
    existing = await db.execute(select(Observation).where(Observation.file_hash == client_file_hash))
    existing_obs = existing.scalar_one_or_none()
    
    if existing_obs:
        shutil.rmtree(os.path.join(settings.CHUNK_DIR, upload_id))
        return ObservationMetadata(
            id=existing_obs.id,
            file_hash=existing_obs.file_hash,
            file_name=existing_obs.file_name,
            file_size=existing_obs.file_size,
            observation_time=existing_obs.observation_time,
            frequency_start=existing_obs.frequency_start,
            frequency_end=existing_obs.frequency_end,
            ra=0.0,
            dec=0.0,
            created_at=existing_obs.created_at
        )
    
    final_path = os.path.join(settings.UPLOAD_DIR, f"{upload_id}_{session.file_name}")
    chunk_dir = os.path.join(settings.CHUNK_DIR, upload_id)
    
    async with aiofiles.open(final_path, 'wb') as outfile:
        for i in range(session.total_chunks):
            chunk_path = os.path.join(chunk_dir, f"chunk_{i}")
            async with aiofiles.open(chunk_path, 'rb') as infile:
                await outfile.write(await infile.read())
    
    server_file_hash = calculate_sha256(final_path)
    
    if server_file_hash != client_file_hash:
        os.remove(final_path)
        shutil.rmtree(chunk_dir)
        return None
    
    metadata = extract_fits_metadata(final_path)
    
    observation = Observation(
        file_hash=server_file_hash,
        file_name=session.file_name,
        file_size=session.file_size,
        observation_time=metadata['observation_time'],
        frequency_start=metadata['frequency_start'],
        frequency_end=metadata['frequency_end'],
        coordinate=ST_MakePoint(metadata['ra'], metadata['dec']),
        storage_path=final_path
    )
    
    db.add(observation)
    await db.commit()
    await db.refresh(observation)
    
    shutil.rmtree(chunk_dir)
    
    return ObservationMetadata(
        id=observation.id,
        file_hash=observation.file_hash,
        file_name=observation.file_name,
        file_size=observation.file_size,
        observation_time=observation.observation_time,
        frequency_start=observation.frequency_start,
        frequency_end=observation.frequency_end,
        ra=metadata['ra'],
        dec=metadata['dec'],
        created_at=observation.created_at
    )

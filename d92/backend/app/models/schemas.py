from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List

class UploadInitRequest(BaseModel):
    file_name: str
    file_size: int
    total_chunks: int

class UploadInitResponse(BaseModel):
    upload_id: str
    chunk_size: int

class ChunkUploadResponse(BaseModel):
    received: bool
    chunk_index: int

class UploadCompleteRequest(BaseModel):
    upload_id: str
    file_hash: str

class CompressionInfo(BaseModel):
    is_compressed: bool
    original_size: int
    compressed_size: int
    compression_ratio: float

class ObservationMetadata(BaseModel):
    id: str
    file_hash: str
    file_name: str
    file_size: int
    observation_time: datetime
    frequency_start: float
    frequency_end: float
    ra: float
    dec: float
    created_at: datetime
    is_compressed: bool = False
    original_size: Optional[int] = None
    compressed_size: Optional[int] = None
    compression_ratio: Optional[float] = None
    estimated_download_time: Optional[float] = None
    estimated_download_time_str: Optional[str] = None

    class Config:
        from_attributes = True

class UploadCompleteResponse(BaseModel):
    success: bool
    observation_id: str
    metadata: ObservationMetadata

class SpatialQueryRequest(BaseModel):
    ra_min: float
    ra_max: float
    dec_min: float
    dec_max: float
    page: Optional[int] = 1
    page_size: Optional[int] = 20

class ObservationListResponse(BaseModel):
    data: List[ObservationMetadata]
    total: int
    page: int
    page_size: int

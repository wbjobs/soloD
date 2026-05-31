from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy import Column, String, BigInteger, DateTime, func
from geoalchemy2 import Geometry
from pydantic_settings import BaseSettings
from uuid import uuid4

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/radio_archive"
    CHUNK_DIR: str = "./chunks"
    UPLOAD_DIR: str = "./uploads"
    CHUNK_SIZE: int = 5 * 1024 * 1024

    class Config:
        env_file = ".env"

settings = Settings()

engine = create_async_engine(settings.DATABASE_URL, echo=True)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()

class Observation(Base):
    __tablename__ = "observations"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    file_hash = Column(String(64), unique=True, nullable=False)
    file_name = Column(String(255), nullable=False)
    file_size = Column(BigInteger, nullable=False)
    observation_time = Column(DateTime(timezone=True), nullable=False)
    frequency_start = Column(BigInteger, nullable=False)
    frequency_end = Column(BigInteger, nullable=False)
    coordinate = Column(Geometry(geometry_type='POINT', srid=4326), nullable=False)
    storage_path = Column(String(512), nullable=False)
    is_compressed = Column(String(10), default='false')
    original_size = Column(BigInteger)
    compressed_size = Column(BigInteger)
    compression_ratio = Column(BigInteger)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class UploadSession(Base):
    __tablename__ = "upload_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    file_name = Column(String(255), nullable=False)
    file_size = Column(BigInteger, nullable=False)
    total_chunks = Column(BigInteger, nullable=False)
    received_chunks = Column(BigInteger, default=0)
    status = Column(String(20), default='pending')
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)

async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

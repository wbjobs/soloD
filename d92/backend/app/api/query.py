from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from ..models.database import get_db
from ..models.schemas import (
    ObservationListResponse,
    ObservationMetadata,
    SpatialQueryRequest
)
from ..services.query_service import query_by_spatial, get_all_observations, get_observation_by_id

router = APIRouter(prefix="/api/observations", tags=["observations"])

@router.get("", response_model=ObservationListResponse)
async def list_observations(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
):
    return await get_all_observations(db, page, page_size)

@router.get("/{observation_id}", response_model=ObservationMetadata)
async def get_observation(
    observation_id: str,
    db: AsyncSession = Depends(get_db)
):
    observation = await get_observation_by_id(db, observation_id)
    if not observation:
        raise HTTPException(status_code=404, detail="Observation not found")
    return observation

@router.post("/query/spatial", response_model=ObservationListResponse)
async def spatial_query(
    request: SpatialQueryRequest,
    db: AsyncSession = Depends(get_db)
):
    return await query_by_spatial(db, request)

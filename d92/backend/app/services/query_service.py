from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_
from geoalchemy2.functions import ST_MakeEnvelope, ST_Intersects, ST_X, ST_Y, ST_Point
from typing import List
from ..models.database import Observation
from ..models.schemas import ObservationMetadata, SpatialQueryRequest, ObservationListResponse
from .fits_compression import estimate_download_time, format_download_time


def normalize_ra(ra: float) -> float:
    """规范化赤经到0-360度范围"""
    while ra < 0:
        ra += 360
    while ra >= 360:
        ra -= 360
    return ra


def ra_to_lng(ra: float) -> float:
    """转换0-360度赤经到-180-180度经度"""
    lng = ra
    if lng > 180:
        lng = lng - 360
    return lng


def crosses_ra_zero(ra_min: float, ra_max: float) -> bool:
    """检查边界是否跨越0度赤经线"""
    return ra_min > ra_max


async def query_by_spatial(
    db: AsyncSession,
    request: SpatialQueryRequest
) -> ObservationListResponse:
    ra_min = normalize_ra(request.ra_min)
    ra_max = normalize_ra(request.ra_max)
    dec_min = max(-90, min(90, request.dec_min))
    dec_max = max(-90, min(90, request.dec_max))

    # 确保 min <= max
    if dec_min > dec_max:
        dec_min, dec_max = dec_max, dec_min

    if crosses_ra_zero(ra_min, ra_max):
        # 跨越0度赤经线，分成两个区域查询
        envelope1 = ST_MakeEnvelope(
            ra_to_lng(ra_min),
            dec_min,
            ra_to_lng(360),
            dec_max,
            4326
        )
        envelope2 = ST_MakeEnvelope(
            ra_to_lng(0),
            dec_min,
            ra_to_lng(ra_max),
            dec_max,
            4326
        )

        count_query = select(func.count(Observation.id)).where(
            or_(
                ST_Intersects(Observation.coordinate, envelope1),
                ST_Intersects(Observation.coordinate, envelope2)
            )
        )
        count_result = await db.execute(count_query)
        total = count_result.scalar() or 0

        offset = (request.page - 1) * request.page_size
        query = (
            select(
                Observation,
                ST_X(Observation.coordinate).label('lng'),
                ST_Y(Observation.coordinate).label('dec')
            )
            .where(
                or_(
                    ST_Intersects(Observation.coordinate, envelope1),
                    ST_Intersects(Observation.coordinate, envelope2)
                )
            )
            .order_by(Observation.observation_time.desc())
            .offset(offset)
            .limit(request.page_size)
        )
    else:
        # 正常区域查询
        envelope = ST_MakeEnvelope(
            ra_to_lng(ra_min),
            dec_min,
            ra_to_lng(ra_max),
            dec_max,
            4326
        )

        count_query = select(func.count(Observation.id)).where(
            ST_Intersects(Observation.coordinate, envelope)
        )
        count_result = await db.execute(count_query)
        total = count_result.scalar() or 0

        offset = (request.page - 1) * request.page_size
        query = (
            select(
                Observation,
                ST_X(Observation.coordinate).label('lng'),
                ST_Y(Observation.coordinate).label('dec')
            )
            .where(ST_Intersects(Observation.coordinate, envelope))
            .order_by(Observation.observation_time.desc())
            .offset(offset)
            .limit(request.page_size)
        )

    result = await db.execute(query)
    rows = result.all()

    data = []
    for row in rows:
        obs = row[0]
        # 将经度(-180-180)转换回赤经(0-360)
        ra = normalize_ra(row.lng)

        # 计算预估下载时间
        est_time = estimate_download_time(obs.file_size)
        est_time_str = format_download_time(est_time)

        # 解压缩率
        compression_ratio = None
        if obs.compression_ratio:
            compression_ratio = obs.compression_ratio / 1000.0

        is_compressed = obs.is_compressed == 'true' if obs.is_compressed else False

        data.append(ObservationMetadata(
            id=obs.id,
            file_hash=obs.file_hash,
            file_name=obs.file_name,
            file_size=obs.file_size,
            observation_time=obs.observation_time,
            frequency_start=obs.frequency_start,
            frequency_end=obs.frequency_end,
            ra=ra,
            dec=row.dec,
            created_at=obs.created_at,
            is_compressed=is_compressed,
            original_size=obs.original_size,
            compressed_size=obs.compressed_size,
            compression_ratio=compression_ratio,
            estimated_download_time=est_time,
            estimated_download_time_str=est_time_str
        ))

    return ObservationListResponse(
        data=data,
        total=total,
        page=request.page,
        page_size=request.page_size
    )

async def get_all_observations(
    db: AsyncSession,
    page: int = 1,
    page_size: int = 20
) -> ObservationListResponse:
    count_query = select(func.count(Observation.id))
    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0

    offset = (page - 1) * page_size
    query = (
        select(
            Observation,
            ST_X(Observation.coordinate).label('lng'),
            ST_Y(Observation.coordinate).label('dec')
        )
        .order_by(Observation.observation_time.desc())
        .offset(offset)
        .limit(page_size)
    )

    result = await db.execute(query)
    rows = result.all()

    data = []
    for row in rows:
        obs = row[0]
        # 将经度(-180-180)转换回赤经(0-360)
        ra = normalize_ra(row.lng)

        # 计算预估下载时间
        est_time = estimate_download_time(obs.file_size)
        est_time_str = format_download_time(est_time)

        # 解压缩率
        compression_ratio = None
        if obs.compression_ratio:
            compression_ratio = obs.compression_ratio / 1000.0

        is_compressed = obs.is_compressed == 'true' if obs.is_compressed else False

        data.append(ObservationMetadata(
            id=obs.id,
            file_hash=obs.file_hash,
            file_name=obs.file_name,
            file_size=obs.file_size,
            observation_time=obs.observation_time,
            frequency_start=obs.frequency_start,
            frequency_end=obs.frequency_end,
            ra=ra,
            dec=row.dec,
            created_at=obs.created_at,
            is_compressed=is_compressed,
            original_size=obs.original_size,
            compressed_size=obs.compressed_size,
            compression_ratio=compression_ratio,
            estimated_download_time=est_time,
            estimated_download_time_str=est_time_str
        ))

    return ObservationListResponse(
        data=data,
        total=total,
        page=page,
        page_size=page_size
    )

async def get_observation_by_id(
    db: AsyncSession,
    observation_id: str
) -> ObservationMetadata:
    query = (
        select(
            Observation,
            ST_X(Observation.coordinate).label('lng'),
            ST_Y(Observation.coordinate).label('dec')
        )
        .where(Observation.id == observation_id)
    )

    result = await db.execute(query)
    row = result.first()

    if not row:
        return None

    obs = row[0]
    # 将经度(-180-180)转换回赤经(0-360)
    ra = normalize_ra(row.lng)

    # 计算预估下载时间
    est_time = estimate_download_time(obs.file_size)
    est_time_str = format_download_time(est_time)

    # 解压缩率
    compression_ratio = None
    if obs.compression_ratio:
        compression_ratio = obs.compression_ratio / 1000.0

    is_compressed = obs.is_compressed == 'true' if obs.is_compressed else False

    return ObservationMetadata(
        id=obs.id,
        file_hash=obs.file_hash,
        file_name=obs.file_name,
        file_size=obs.file_size,
        observation_time=obs.observation_time,
        frequency_start=obs.frequency_start,
        frequency_end=obs.frequency_end,
        ra=ra,
        dec=row.dec,
        created_at=obs.created_at,
        is_compressed=is_compressed,
        original_size=obs.original_size,
        compressed_size=obs.compressed_size,
        compression_ratio=compression_ratio,
        estimated_download_time=est_time,
        estimated_download_time_str=est_time_str
    )

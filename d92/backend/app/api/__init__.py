from fastapi import APIRouter
from .upload import router as upload_router
from .query import router as query_router

api_router = APIRouter()
api_router.include_router(upload_router)
api_router.include_router(query_router)

__all__ = ["api_router"]

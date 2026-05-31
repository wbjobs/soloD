from fastapi import FastAPI
import threading
import logging

from redis_client import RedisClient
from mongodb_store import MongoDBStore
from model_loader import ModelLoader
from api_routes import router, init_routes
from task_worker import TaskWorker

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Emotion Analysis API", version="1.0.0")

redis_client = RedisClient()
mongodb_store = MongoDBStore()
model_loader = ModelLoader()

@app.on_event("startup")
async def startup_event():
    logger.info("Loading models...")
    model_loader.load_models()
    logger.info("Models loaded successfully")
    
    init_routes(redis_client, mongodb_store)
    app.include_router(router)
    
    worker = TaskWorker(redis_client, mongodb_store, model_loader)
    worker_thread = threading.Thread(target=worker.run, daemon=True)
    worker_thread.start()
    logger.info("Worker thread started")

@app.on_event("shutdown")
async def shutdown_event():
    redis_client.close()
    mongodb_store.close()
    logger.info("Connections closed")

@app.get("/")
async def root():
    return {"message": "Emotion Analysis API", "version": "1.0.0"}

@app.get("/health")
async def health():
    queue_stats = redis_client.get_queue_length()
    return {
        "status": "healthy",
        "queue_stats": queue_stats
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

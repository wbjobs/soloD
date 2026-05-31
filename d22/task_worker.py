import base64
import logging
import time
from typing import Dict, Any

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class TaskWorker:
    def __init__(self, redis_client, mongodb_store, model_loader):
        self.redis_client = redis_client
        self.mongodb_store = mongodb_store
        self.model_loader = model_loader
        self.recovery_interval = 60
        self.last_recovery = time.time()
        
    def process_task(self, task: Dict[str, Any]) -> None:
        task_id = task["task_id"]
        retry_count = task.get("retry_count", 0)
        data = task["data"]
        
        logger.info(f"Processing task: {task_id} (retry: {retry_count})")
        self.redis_client.set_task_status(task_id, "processing")
        
        try:
            text = data["text"]
            image_base64 = data["image"]
            image_data = base64.b64decode(image_base64)
            
            cached_result = self.redis_client.get_cached_result(text, image_data)
            if cached_result:
                logger.info(f"Cache hit for task: {task_id}")
                result = {
                    **cached_result,
                    "from_cache": True
                }
                self.mongodb_store.save_result(task_id, result)
                self.redis_client.ack_task(task_id)
                self.redis_client.set_task_status(task_id, "completed")
                self.redis_client.delete_task_status(task_id)
                return
            
            logger.info(f"Cache miss for task: {task_id}, running inference...")
            result = self.model_loader.predict(text, image_data)
            result["from_cache"] = False
            
            self.redis_client.set_cached_result(text, image_data, result)
            
            self.mongodb_store.save_result(task_id, result)
            self.redis_client.ack_task(task_id)
            self.redis_client.set_task_status(task_id, "completed")
            self.redis_client.delete_task_status(task_id)
            
            logger.info(f"Task completed: {task_id}")
            
        except Exception as e:
            logger.error(f"Error processing task {task_id}: {str(e)}")
            self.redis_client.nack_task(task)
            self.redis_client.set_task_status(task_id, "failed")
            
    def run(self) -> None:
        logger.info("Task worker started, waiting for tasks...")
        while True:
            current_time = time.time()
            if current_time - self.last_recovery >= self.recovery_interval:
                recovered = self.redis_client.recover_stuck_tasks()
                if recovered > 0:
                    logger.info(f"Recovered {recovered} stuck tasks")
                self.last_recovery = current_time
            
            task = self.redis_client.pop_task(timeout=5)
            if task:
                self.process_task(task)

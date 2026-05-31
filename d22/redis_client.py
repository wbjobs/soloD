import redis
import json
import time
import hashlib
from typing import Optional, Dict, Any

class RedisClient:
    def __init__(self, host: str = "localhost", port: int = 6379, db: int = 0, queue_name: str = "emotion_tasks"):
        self.redis = redis.Redis(host=host, port=port, db=db, decode_responses=True)
        self.queue_name = queue_name
        self.processing_queue = f"{queue_name}:processing"
        self.max_retry = 3
        self.processing_timeout = 300
        self.cache_prefix = "emotion_cache:"
        self.cache_ttl = 86400
        self.cache_stats_key = "cache_stats"
        
    def push_task(self, task_id: str, task_data: Dict[str, Any]) -> None:
        task = {
            "task_id": task_id,
            "data": task_data,
            "retry_count": 0,
            "enqueued_at": time.time()
        }
        self.redis.lpush(self.queue_name, json.dumps(task))
        
    def pop_task(self, timeout: int = 0) -> Optional[Dict[str, Any]]:
        result = self.redis.brpoplpush(
            self.queue_name,
            self.processing_queue,
            timeout=timeout
        )
        if result:
            task = json.loads(result)
            task["started_at"] = time.time()
            self.redis.setex(
                f"processing:{task['task_id']}",
                self.processing_timeout,
                json.dumps(task)
            )
            return task
        return None
        
    def ack_task(self, task_id: str) -> None:
        task_key = f"processing:{task_id}"
        task_data = self.redis.get(task_key)
        if task_data:
            task = json.loads(task_data)
            self.redis.lrem(self.processing_queue, 0, json.dumps(task))
            self.redis.delete(task_key)
            
    def nack_task(self, task: Dict[str, Any]) -> None:
        task_id = task["task_id"]
        task_key = f"processing:{task_id}"
        
        self.redis.delete(task_key)
        self.redis.lrem(self.processing_queue, 0, json.dumps(task))
        
        retry_count = task.get("retry_count", 0) + 1
        if retry_count <= self.max_retry:
            task["retry_count"] = retry_count
            task["last_retry_at"] = time.time()
            self.redis.lpush(self.queue_name, json.dumps(task))
        else:
            self.redis.lpush(f"{self.queue_name}:dead", json.dumps(task))
            
    def recover_stuck_tasks(self) -> int:
        recovered = 0
        current_time = time.time()
        task_keys = self.redis.keys("processing:*")
        
        for task_key in task_keys:
            task_data = self.redis.get(task_key)
            if task_data:
                task = json.loads(task_data)
                started_at = task.get("started_at", 0)
                if current_time - started_at > self.processing_timeout:
                    task_id = task["task_id"]
                    self.redis.delete(task_key)
                    self.redis.lrem(self.processing_queue, 0, json.dumps(task))
                    
                    retry_count = task.get("retry_count", 0) + 1
                    if retry_count <= self.max_retry:
                        task["retry_count"] = retry_count
                        self.redis.lpush(self.queue_name, json.dumps(task))
                    else:
                        self.redis.lpush(f"{self.queue_name}:dead", json.dumps(task))
                    recovered += 1
        return recovered
        
    def set_task_status(self, task_id: str, status: str) -> None:
        self.redis.set(f"task_status:{task_id}", status)
        
    def get_task_status(self, task_id: str) -> Optional[str]:
        return self.redis.get(f"task_status:{task_id}")
        
    def delete_task_status(self, task_id: str) -> None:
        self.redis.delete(f"task_status:{task_id}")
        
    def get_queue_length(self) -> Dict[str, int]:
        return {
            "pending": self.redis.llen(self.queue_name),
            "processing": self.redis.llen(self.processing_queue),
            "dead": self.redis.llen(f"{self.queue_name}:dead")
        }
        
    def _generate_cache_key(self, text: str, image_data: bytes) -> str:
        text_hash = hashlib.md5(text.encode('utf-8')).hexdigest()
        image_hash = hashlib.md5(image_data).hexdigest()
        combined = f"{text_hash}:{image_hash}"
        return f"{self.cache_prefix}{hashlib.md5(combined.encode('utf-8')).hexdigest()}"
        
    def get_cached_result(self, text: str, image_data: bytes) -> Optional[Dict[str, Any]]:
        cache_key = self._generate_cache_key(text, image_data)
        cached = self.redis.get(cache_key)
        if cached:
            self.redis.hincrby(self.cache_stats_key, "hits", 1)
            return json.loads(cached)
        self.redis.hincrby(self.cache_stats_key, "misses", 1)
        return None
        
    def set_cached_result(self, text: str, image_data: bytes, result: Dict[str, Any]) -> None:
        cache_key = self._generate_cache_key(text, image_data)
        cache_data = {
            **result,
            "cached_at": time.time(),
            "cache_key": cache_key
        }
        self.redis.setex(cache_key, self.cache_ttl, json.dumps(cache_data))
        self.redis.hincrby(self.cache_stats_key, "total", 1)
        
    def get_cache_stats(self) -> Dict[str, Any]:
        stats = self.redis.hgetall(self.cache_stats_key)
        hits = int(stats.get("hits", 0))
        misses = int(stats.get("misses", 0))
        total = hits + misses
        hit_rate = hits / total if total > 0 else 0.0
        
        cache_keys = self.redis.keys(f"{self.cache_prefix}*")
        cache_count = len(cache_keys)
        
        return {
            "hits": hits,
            "misses": misses,
            "total_requests": total,
            "hit_rate": round(hit_rate * 100, 2),
            "cached_items": cache_count,
            "cache_ttl_seconds": self.cache_ttl
        }
        
    def clear_cache(self) -> int:
        cache_keys = self.redis.keys(f"{self.cache_prefix}*")
        if cache_keys:
            self.redis.delete(*cache_keys)
        self.redis.delete(self.cache_stats_key)
        return len(cache_keys)
        
    def close(self) -> None:
        self.redis.close()

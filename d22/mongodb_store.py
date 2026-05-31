from pymongo import MongoClient
from datetime import datetime
from typing import Optional, Dict, Any

class MongoDBStore:
    def __init__(self, host: str = "localhost", port: int = 27017, db_name: str = "emotion_analysis"):
        self.client = MongoClient(host, port)
        self.db = self.client[db_name]
        self.results_collection = self.db["results"]
        
    def save_result(self, task_id: str, result: Dict[str, Any]) -> None:
        document = {
            "task_id": task_id,
            "result": result,
            "created_at": datetime.utcnow()
        }
        self.results_collection.update_one(
            {"task_id": task_id},
            {"$set": document},
            upsert=True
        )
        
    def get_result(self, task_id: str) -> Optional[Dict[str, Any]]:
        document = self.results_collection.find_one({"task_id": task_id})
        if document:
            return {
                "task_id": document["task_id"],
                "result": document["result"],
                "created_at": document["created_at"].isoformat()
            }
        return None
        
    def close(self) -> None:
        self.client.close()

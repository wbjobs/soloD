import leveldb
import os
import json
import logging
import pickle
from typing import Optional, Dict

logger = logging.getLogger(__name__)


class LevelDBStore:
    def __init__(self, db_path: str):
        self.db_path = db_path
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self.db = leveldb.LevelDB(db_path)
    
    def put(self, key: str, value: dict):
        try:
            key_bytes = key.encode('utf-8')
            value_bytes = json.dumps(value).encode('utf-8')
            self.db.Put(key_bytes, value_bytes)
        except Exception as e:
            logger.error(f"Error putting key {key}: {e}")
            raise
    
    def get(self, key: str) -> Optional[dict]:
        try:
            key_bytes = key.encode('utf-8')
            value_bytes = self.db.Get(key_bytes)
            if value_bytes:
                return json.loads(value_bytes.decode('utf-8'))
            return None
        except KeyError:
            return None
        except Exception as e:
            logger.error(f"Error getting key {key}: {e}")
            raise
    
    def delete(self, key: str):
        try:
            key_bytes = key.encode('utf-8')
            self.db.Delete(key_bytes)
        except Exception as e:
            logger.error(f"Error deleting key {key}: {e}")
            raise
    
    def get_all(self) -> Dict[str, dict]:
        all_data = {}
        try:
            for key, value in self.db.RangeIter():
                all_data[key.decode('utf-8')] = json.loads(value.decode('utf-8'))
        except Exception as e:
            logger.error(f"Error getting all data: {e}")
        return all_data
    
    def restore_from(self, data: Dict[str, dict]):
        try:
            batch = leveldb.WriteBatch()
            
            for key in list(self.get_all().keys()):
                batch.Delete(key.encode('utf-8'))
            
            for key, value in data.items():
                batch.Put(key.encode('utf-8'), json.dumps(value).encode('utf-8'))
            
            self.db.Write(batch)
            logger.info(f"Restored {len(data)} entries from snapshot")
        except Exception as e:
            logger.error(f"Error restoring from data: {e}")
            raise
    
    def create_snapshot(self) -> bytes:
        all_data = self.get_all()
        return pickle.dumps(all_data)
    
    def restore_snapshot(self, snapshot_data: bytes):
        data = pickle.loads(snapshot_data)
        self.restore_from(data)
    
    def close(self):
        pass


class KVStateMachine:
    def __init__(self, store: LevelDBStore):
        self.store = store
    
    def apply(self, command: dict):
        if not command:
            return
        
        op = command.get("op")
        if op == "put":
            key = command.get("key")
            value = command.get("value")
            if key and value is not None:
                self.store.put(key, value)
                logger.debug(f"Applied put: {key}")
        elif op == "delete":
            key = command.get("key")
            if key:
                self.store.delete(key)
                logger.debug(f"Applied delete: {key}")
    
    def get(self, key: str) -> Optional[dict]:
        return self.store.get(key)
    
    def create_snapshot(self) -> bytes:
        return self.store.create_snapshot()
    
    def restore_snapshot(self, snapshot_data: bytes):
        self.store.restore_snapshot(snapshot_data)

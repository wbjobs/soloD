import time
from collections import deque
from threading import Lock
from typing import List, Dict, Optional

class WeatherDataCache:
    def __init__(self, max_age_seconds: int = 30):
        self.max_age_seconds = max_age_seconds
        self._cache: deque = deque()
        self._lock = Lock()
        
    def add_data(self, data: List[Dict]):
        timestamp = time.time()
        with self._lock:
            self._cache.append({
                'timestamp': timestamp,
                'data': data
            })
            self._cleanup_old_data()
    
    def _cleanup_old_data(self):
        cutoff = time.time() - self.max_age_seconds
        while self._cache and self._cache[0]['timestamp'] < cutoff:
            self._cache.popleft()
    
    def get_history(self, start_time: Optional[float] = None, end_time: Optional[float] = None) -> List[Dict]:
        with self._lock:
            self._cleanup_old_data()
            result = list(self._cache)
        
        if start_time is not None:
            result = [item for item in result if item['timestamp'] >= start_time]
        if end_time is not None:
            result = [item for item in result if item['timestamp'] <= end_time]
        
        return result
    
    def get_data_at_time(self, target_time: float) -> Optional[Dict]:
        with self._lock:
            self._cleanup_old_data()
            if not self._cache:
                return None
            
            closest = min(self._cache, key=lambda x: abs(x['timestamp'] - target_time))
            if abs(closest['timestamp'] - target_time) <= 1.0:
                return closest
            return None
    
    def get_time_range(self) -> Dict:
        with self._lock:
            self._cleanup_old_data()
            if not self._cache:
                return {'start': None, 'end': None, 'count': 0}
            return {
                'start': self._cache[0]['timestamp'],
                'end': self._cache[-1]['timestamp'],
                'count': len(self._cache)
            }
    
    def clear(self):
        with self._lock:
            self._cache.clear()

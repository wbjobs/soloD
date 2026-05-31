import asyncio
import random
import time
from typing import List, Dict
from threading import Lock

class WeatherStation:
    def __init__(self, station_id: int, name: str, base_lat: float, base_lon: float):
        self.station_id = station_id
        self.name = name
        self.base_lat = base_lat
        self.base_lon = base_lon
        self.wind_speed = random.uniform(5, 25)
        self.wind_direction = random.uniform(0, 360)
        self.pressure = random.uniform(980, 1040)
        self.temperature = random.uniform(-10, 35)
        
    def update(self):
        self.wind_speed = max(0, min(50, self.wind_speed + random.uniform(-2, 2)))
        self.wind_direction = (self.wind_direction + random.uniform(-10, 10)) % 360
        self.pressure = max(950, min(1060, self.pressure + random.uniform(-2, 2)))
        self.temperature = max(-20, min(45, self.temperature + random.uniform(-0.5, 0.5)))
        
    def get_data(self, timestamp: float) -> Dict:
        return {
            "station_id": self.station_id,
            "name": self.name,
            "lat": self.base_lat,
            "lon": self.base_lon,
            "wind_speed": round(self.wind_speed, 2),
            "wind_direction": round(self.wind_direction, 2),
            "pressure": round(self.pressure, 2),
            "temperature": round(self.temperature, 2),
            "timestamp": timestamp
        }

class WeatherDataGenerator:
    def __init__(self):
        self.stations = [
            WeatherStation(1, "北京气象站", 39.9, 116.4),
            WeatherStation(2, "上海气象站", 31.2, 121.5),
            WeatherStation(3, "广州气象站", 23.1, 113.3)
        ]
        self._lock = Lock()
        self._current_timestamp = time.time()
        
    def update_all(self):
        with self._lock:
            self._current_timestamp = time.time()
            for station in self.stations:
                station.update()
            
    def get_all_data(self) -> List[Dict]:
        with self._lock:
            timestamp = self._current_timestamp
            return [station.get_data(timestamp) for station in self.stations]
    
    def get_station_data(self, station_id: int) -> Dict:
        with self._lock:
            timestamp = self._current_timestamp
            for station in self.stations:
                if station.station_id == station_id:
                    return station.get_data(timestamp)
        return None

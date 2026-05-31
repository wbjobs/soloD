from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import json
import logging
from typing import Set, Optional
from data_generator import WeatherDataGenerator
from data_cache import WeatherDataCache

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="气象数据实时服务")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

data_generator = WeatherDataGenerator()
data_cache = WeatherDataCache(max_age_seconds=30)

class ConnectionManager:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()
        
    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        async with self._lock:
            self.active_connections.add(websocket)
        logger.info(f"WebSocket连接成功，当前连接数: {len(self.active_connections)}")
        
    async def disconnect(self, websocket: WebSocket):
        async with self._lock:
            if websocket in self.active_connections:
                self.active_connections.remove(websocket)
        logger.info(f"WebSocket断开连接，当前连接数: {len(self.active_connections)}")
        
    async def broadcast(self, message: str):
        async with self._lock:
            connections = list(self.active_connections)
        
        for connection in connections:
            try:
                await asyncio.wait_for(connection.send_text(message), timeout=5.0)
            except asyncio.TimeoutError:
                logger.warning("WebSocket发送超时")
            except Exception as e:
                logger.debug(f"WebSocket发送失败: {e}")

manager = ConnectionManager()

async def update_weather_data():
    while True:
        try:
            data_generator.update_all()
            data = data_generator.get_all_data()
            data_cache.add_data(data)
            await manager.broadcast(json.dumps({"type": "weather_data", "data": data}, ensure_ascii=False))
        except Exception as e:
            logger.error(f"数据更新失败: {e}")
        await asyncio.sleep(0.2)

@app.on_event("startup")
async def startup_event():
    asyncio.create_task(update_weather_data())

@app.get("/")
async def root():
    return {"message": "气象数据API服务运行中"}

@app.get("/api/stations")
async def get_stations():
    return {"stations": data_generator.get_all_data()}

@app.get("/api/station/{station_id}")
async def get_station(station_id: int):
    data = data_generator.get_station_data(station_id)
    if data:
        return {"station": data}
    return {"error": "气象站不存在"}, 404

@app.get("/api/history/range")
async def get_history_range():
    return data_cache.get_time_range()

@app.get("/api/history")
async def get_history(
    start_time: Optional[float] = Query(None, description="开始时间戳"),
    end_time: Optional[float] = Query(None, description="结束时间戳")
):
    history = data_cache.get_history(start_time, end_time)
    return {
        "count": len(history),
        "history": history
    }

@app.get("/api/history/{timestamp}")
async def get_history_at_time(timestamp: float):
    data = data_cache.get_data_at_time(timestamp)
    if data:
        return data
    return {"error": "未找到对应时间的数据"}, 404

@app.websocket("/ws/weather")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    ping_task = None
    
    async def send_ping():
        while True:
            try:
                await websocket.send_text(json.dumps({"type": "ping"}))
                await asyncio.sleep(10)
            except:
                break
    
    try:
        initial_data = data_generator.get_all_data()
        await websocket.send_text(json.dumps({"type": "weather_data", "data": initial_data}, ensure_ascii=False))
        
        ping_task = asyncio.create_task(send_ping())
        
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                try:
                    message = json.loads(data)
                    if message.get("type") == "ping":
                        await websocket.send_text(json.dumps({"type": "pong"}))
                    elif message.get("type") == "pong":
                        pass
                except json.JSONDecodeError:
                    pass
            except asyncio.TimeoutError:
                logger.warning("WebSocket接收超时，关闭连接")
                break
    except WebSocketDisconnect:
        logger.info("客户端正常断开连接")
    except Exception as e:
        logger.error(f"WebSocket异常: {e}")
    finally:
        if ping_task:
            ping_task.cancel()
        await manager.disconnect(websocket)

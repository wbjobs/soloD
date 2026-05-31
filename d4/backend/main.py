from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.websockets import WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import datetime
import uuid
import json
import asyncio
from clickhouse_client import ClickHouseClient
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="用户行为分析平台 API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ch_client = ClickHouseClient()


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.broadcast_task = None
        self.running = False

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)
        logger.info(f"WebSocket connected, total: {len(self.active_connections)}")
        if not self.running and len(self.active_connections) > 0:
            self.running = True
            self.broadcast_task = asyncio.create_task(self.broadcast_stats())

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        logger.info(f"WebSocket disconnected, total: {len(self.active_connections)}")
        if len(self.active_connections) == 0 and self.broadcast_task:
            self.running = False
            self.broadcast_task.cancel()

    async def broadcast_stats(self):
        while self.running:
            try:
                stats = ch_client.get_realtime_stats()
                message = json.dumps({
                    'type': 'realtime_stats',
                    'data': stats,
                    'timestamp': datetime.now().isoformat()
                })
                for connection in self.active_connections:
                    try:
                        await connection.send_text(message)
                    except:
                        pass
            except Exception as e:
                logger.error(f"Broadcast error: {str(e)}")
            await asyncio.sleep(1)


manager = ConnectionManager()


class UserEvent(BaseModel):
    user_id: str
    session_id: str
    event_type: str
    page_url: str
    referrer: str = ""
    user_agent: str = ""
    ip_address: str = ""
    country: str = ""
    city: str = ""
    device_type: str = ""
    browser: str = ""
    os: str = ""
    event_properties: Dict[str, str] = {}
    timestamp: Optional[str] = None


class FunnelStep(BaseModel):
    name: str
    event_type: str = "page_view"
    page_url: str = ""


class SQLQuery(BaseModel):
    sql: str


class AlertRule(BaseModel):
    rule_name: str
    metric: str
    condition: str
    threshold: float
    window_minutes: int = 5


class TagFilter(BaseModel):
    tag_name: str
    tag_value: str


@app.websocket("/ws/realtime")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                if message.get('type') == 'ping':
                    await websocket.send_text(json.dumps({'type': 'pong'}))
            except:
                pass
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@app.post("/api/events")
async def receive_events(events: List[UserEvent]):
    try:
        formatted_events = []
        for event in events:
            event_dict = event.dict()
            event_dict['event_id'] = str(uuid.uuid4())
            if not event_dict['timestamp']:
                event_dict['timestamp'] = datetime.now()
            else:
                event_dict['timestamp'] = datetime.fromisoformat(event_dict['timestamp'])
            formatted_events.append(event_dict)
        
        count = ch_client.insert_events(formatted_events)
        return {"status": "success", "count": count, "buffered": True}
    except Exception as e:
        logger.error(f"Receive events error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/stats/realtime")
async def get_realtime_stats():
    try:
        stats = ch_client.get_realtime_stats()
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/stats/hourly")
async def get_hourly_trend(hours: int = 24):
    try:
        data = ch_client.get_hourly_trend(hours)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/stats/daily")
async def get_daily_pv_uv(days: int = 7):
    try:
        data = ch_client.get_daily_pv_uv(days)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/stats/top-pages")
async def get_top_pages(limit: int = 10):
    try:
        data = ch_client.get_top_pages(limit)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/stats/countries")
async def get_countries():
    try:
        data = ch_client.get_countries()
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/stats/devices")
async def get_device_types():
    try:
        data = ch_client.get_device_types()
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/analysis/funnel")
async def funnel_analysis(steps: List[FunnelStep]):
    try:
        steps_dict = [s.dict() for s in steps]
        data = ch_client.get_funnel_analysis(steps_dict)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/analysis/retention")
async def retention_analysis(days: int = 7):
    try:
        from datetime import timedelta
        conn = ch_client.pool.get_connection()
        try:
            result = conn.execute(f'''
                WITH first_events AS (
                    SELECT
                        user_id,
                        min(toDate(timestamp)) as first_date
                    FROM user_events
                    GROUP BY user_id
                )
                SELECT
                    fe.first_date as cohort_date,
                    dateDiff('day', fe.first_date, toDate(ue.timestamp)) as retention_day,
                    uniqExact(ue.user_id) as user_count
                FROM first_events fe
                JOIN user_events ue ON fe.user_id = ue.user_id
                WHERE fe.first_date >= now() - INTERVAL {days} DAY
                  AND retention_day <= {days}
                GROUP BY cohort_date, retention_day
                ORDER BY cohort_date, retention_day
            ''')
            return [
                {
                    'cohort_date': row[0].isoformat(),
                    'retention_day': int(row[1]),
                    'user_count': int(row[2])
                }
                for row in result
            ]
        finally:
            ch_client.pool.release_connection(conn)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/analysis/user-paths")
async def user_paths(limit: int = 1000):
    try:
        data = ch_client.get_user_paths(limit)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/query")
async def execute_sql(query: SQLQuery):
    try:
        data = ch_client.execute_query(query.sql)
        return {"data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/alerts/rules")
async def get_alert_rules():
    try:
        data = ch_client.get_alert_rules()
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/alerts/rules")
async def create_alert_rule(rule: AlertRule):
    try:
        rule_dict = rule.dict()
        rule_dict['rule_id'] = str(uuid.uuid4())
        result = ch_client.create_alert_rule(rule_dict)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/alerts/rules/{rule_id}")
async def delete_alert_rule(rule_id: str):
    try:
        ch_client.delete_alert_rule(rule_id)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/alerts/check")
async def check_anomalies():
    try:
        anomalies = ch_client.check_anomalies()
        for anomaly in anomalies:
            alert_data = anomaly.copy()
            alert_data['alert_id'] = str(uuid.uuid4())
            alert_data['message'] = f"{anomaly['rule_name']}: 当前值 {anomaly['current_value']} {anomaly['condition']} 阈值 {anomaly['threshold']}"
            ch_client.create_alert(alert_data)
        return {"anomalies": anomalies, "count": len(anomalies)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/alerts/history")
async def get_alert_history(limit: int = 100):
    try:
        data = ch_client.get_alert_history(limit)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/user-profiles/generate-tags")
async def generate_user_tags():
    try:
        count = ch_client.generate_user_tags()
        return {"status": "success", "tags_generated": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/user-profiles/{user_id}")
async def get_user_profile(user_id: str):
    try:
        data = ch_client.get_user_profile(user_id)
        if not data['stats']['total_events']:
            raise HTTPException(status_code=404, detail="User not found")
        return data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/user-profiles/search")
async def search_users(filters: List[TagFilter] = None, limit: int = 100):
    try:
        tag_filters = [f.dict() for f in filters] if filters else None
        data = ch_client.search_users(tag_filters, limit)
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/user-profiles/tags/summary")
async def get_tag_summary():
    try:
        data = ch_client.get_tag_summary()
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/export/events")
async def export_events(
    start_date: Optional[str] = None, 
    end_date: Optional[str] = None, 
    limit: int = 10000
):
    try:
        csv_content = ch_client.export_events_csv(start_date, end_date, limit)
        from fastapi import Response
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=user_events_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/export/user-profiles")
async def export_user_profiles(limit: int = 10000):
    try:
        csv_content = ch_client.export_user_profiles_csv(limit)
        from fastapi import Response
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename=user_profiles_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "timestamp": datetime.now().isoformat(),
        "version": "2.0.0",
        "websocket_connections": len(manager.active_connections)
    }


@app.on_event("shutdown")
async def shutdown_event():
    ch_client.close()
    logger.info("Shutdown complete")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

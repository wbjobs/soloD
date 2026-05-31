import asyncio
import grpc
import redis
import time
import json
from concurrent import futures
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import logging
from pydantic import BaseModel
from typing import List, Dict, Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

import proto.syscall_pb2 as syscall_pb2
import proto.syscall_pb2_grpc as syscall_pb2_grpc

REDIS_URL = "redis://localhost:6379"
REDIS_STREAM = "syscall_events"
REDIS_ALERTS_STREAM = "syscall_alerts"
REDIS_MAX_LEN = 10000

class AlertRule(BaseModel):
    id: str
    name: str
    description: str
    process_name: Optional[str] = None
    syscall_name: Optional[str] = None
    args_pattern: Optional[str] = None
    severity: str = "warning"
    enabled: bool = True

class Alert(BaseModel):
    id: str
    rule_id: str
    rule_name: str
    severity: str
    pid: int
    process_name: str
    syscall_name: str
    args: str
    timestamp: int
    triggered_at: int

DEFAULT_RULES = [
    {
        "id": "rule_vim_shadow",
        "name": "Vim Accessing Shadow File",
        "description": "Detects when vim attempts to access /etc/shadow",
        "process_name": "vim",
        "syscall_name": "openat",
        "args_pattern": "/etc/shadow",
        "severity": "critical",
        "enabled": True
    },
    {
        "id": "rule_cat_shadow",
        "name": "Cat Reading Shadow File",
        "description": "Detects when cat reads /etc/shadow",
        "process_name": "cat",
        "syscall_name": "openat",
        "args_pattern": "/etc/shadow",
        "severity": "high",
        "enabled": True
    },
    {
        "id": "rule_etc_passwd",
        "name": "Access to /etc/passwd",
        "description": "Detects access to /etc/passwd file",
        "process_name": None,
        "syscall_name": "openat",
        "args_pattern": "/etc/passwd",
        "severity": "medium",
        "enabled": True
    }
]

class RuleEngine:
    def __init__(self, redis_client):
        self.redis_client = redis_client
        self.rules: Dict[str, AlertRule] = {}
        self._load_rules()
    
    def _load_rules(self):
        try:
            rules_data = self.redis_client.get("alert_rules")
            if rules_data:
                rules = json.loads(rules_data)
                for rule in rules:
                    self.rules[rule["id"]] = AlertRule(**rule)
                logger.info(f"Loaded {len(self.rules)} alert rules from Redis")
            else:
                self._init_default_rules()
        except Exception as e:
            logger.error(f"Failed to load rules: {e}")
            self._init_default_rules()
    
    def _init_default_rules(self):
        logger.info("Initializing default alert rules")
        for rule_data in DEFAULT_RULES:
            rule = AlertRule(**rule_data)
            self.rules[rule.id] = rule
        self._save_rules()
    
    def _save_rules(self):
        try:
            rules_list = [rule.dict() for rule in self.rules.values()]
            self.redis_client.set("alert_rules", json.dumps(rules_list))
        except Exception as e:
            logger.error(f"Failed to save rules: {e}")
    
    def add_rule(self, rule: AlertRule):
        self.rules[rule.id] = rule
        self._save_rules()
        logger.info(f"Added rule: {rule.name}")
    
    def delete_rule(self, rule_id: str):
        if rule_id in self.rules:
            del self.rules[rule_id]
            self._save_rules()
            logger.info(f"Deleted rule: {rule_id}")
            return True
        return False
    
    def get_all_rules(self) -> List[AlertRule]:
        return list(self.rules.values())
    
    def check_event(self, pid: int, process_name: str, syscall_name: str, args: str) -> Optional[Alert]:
        for rule in self.rules.values():
            if not rule.enabled:
                continue
            
            match = True
            
            if rule.process_name and rule.process_name.lower() not in process_name.lower():
                match = False
            
            if rule.syscall_name and rule.syscall_name.lower() != syscall_name.lower():
                match = False
            
            if rule.args_pattern and rule.args_pattern.lower() not in args.lower():
                match = False
            
            if match:
                alert = Alert(
                    id=f"alert_{int(time.time() * 1e9)}_{pid}",
                    rule_id=rule.id,
                    rule_name=rule.name,
                    severity=rule.severity,
                    pid=pid,
                    process_name=process_name,
                    syscall_name=syscall_name,
                    args=args,
                    timestamp=int(time.time() * 1e9),
                    triggered_at=int(time.time())
                )
                logger.warning(f"ALERT TRIGGERED: {rule.name} - {process_name} ({pid}) {syscall_name} {args}")
                return alert
        
        return None

class SyscallCollectorServicer(syscall_pb2_grpc.SyscallCollectorServicer):
    def __init__(self, redis_client, rule_engine):
        self.redis_client = redis_client
        self.rule_engine = rule_engine
        self.received_count = 0

    async def StreamSyscalls(self, request_iterator, context):
        logger.info("New gRPC stream connection established")
        try:
            async for request in request_iterator:
                event_data = {
                    "pid": str(request.pid),
                    "process_name": request.process_name,
                    "syscall_name": request.syscall_name,
                    "args": request.args,
                    "timestamp": str(request.timestamp),
                    "received_at": str(int(time.time() * 1e9))
                }
                
                try:
                    message_id = self.redis_client.xadd(
                        REDIS_STREAM,
                        event_data,
                        maxlen=REDIS_MAX_LEN,
                        approximate=True
                    )
                    self.received_count += 1
                    
                    alert = self.rule_engine.check_event(
                        request.pid,
                        request.process_name,
                        request.syscall_name,
                        request.args
                    )
                    
                    if alert:
                        alert_data = {
                            "id": alert.id,
                            "rule_id": alert.rule_id,
                            "rule_name": alert.rule_name,
                            "severity": alert.severity,
                            "pid": str(alert.pid),
                            "process_name": alert.process_name,
                            "syscall_name": alert.syscall_name,
                            "args": alert.args,
                            "timestamp": str(alert.timestamp),
                            "triggered_at": str(alert.triggered_at)
                        }
                        self.redis_client.xadd(
                            REDIS_ALERTS_STREAM,
                            alert_data,
                            maxlen=1000,
                            approximate=True
                        )
                    
                    if self.received_count % 10 == 0:
                        logger.info(f"Received {self.received_count} events. Last ID: {message_id}")
                        
                except Exception as e:
                    logger.error(f"Failed to add to Redis Stream: {e}")
                    
        except Exception as e:
            logger.error(f"Error in gRPC stream: {e}")
        
        logger.info(f"Stream closed. Total events received: {self.received_count}")
        return syscall_pb2.StreamResponse(
            success=True,
            message=f"Received {self.received_count} events",
            received_count=self.received_count
        )

def create_app():
    app = FastAPI(title="Syscall Monitor Collector")
    
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    redis_client = redis.Redis.from_url(
        REDIS_URL, 
        decode_responses=True,
        socket_connect_timeout=5,
        retry_on_timeout=True
    )
    
    rule_engine = RuleEngine(redis_client)
    
    @app.get("/api/events")
    async def get_events(last_id: str = "$", count: int = 50):
        try:
            if last_id == "$":
                last_id = "0"
            
            events = redis_client.xread(
                {REDIS_STREAM: last_id},
                count=count,
                block=5000
            )
            
            result = []
            new_last_id = last_id
            if events:
                for stream_name, stream_events in events:
                    for event_id, event_data in stream_events:
                        result.append({
                            "id": event_id,
                            "pid": int(event_data.get("pid", 0)),
                            "process_name": event_data.get("process_name", ""),
                            "syscall_name": event_data.get("syscall_name", ""),
                            "args": event_data.get("args", ""),
                            "timestamp": int(event_data.get("timestamp", 0)),
                            "received_at": int(event_data.get("received_at", 0))
                        })
                        new_last_id = event_id
            
            return {"events": result, "last_id": new_last_id}
        except Exception as e:
            logger.error(f"Error fetching events: {e}")
            return {"events": [], "last_id": last_id, "error": str(e)}
    
    @app.get("/api/events/latest")
    async def get_latest_events(count: int = 50):
        try:
            stream_info = redis_client.xinfo_stream(REDIS_STREAM)
            last_id = stream_info.get("last-generated-id", "0-0")
            
            events = redis_client.xrevrange(
                REDIS_STREAM,
                max=last_id,
                min="-",
                count=count
            )
            
            result = []
            for event_id, event_data in reversed(events):
                result.append({
                    "id": event_id,
                    "pid": int(event_data.get("pid", 0)),
                    "process_name": event_data.get("process_name", ""),
                    "syscall_name": event_data.get("syscall_name", ""),
                    "args": event_data.get("args", ""),
                    "timestamp": int(event_data.get("timestamp", 0)),
                    "received_at": int(event_data.get("received_at", 0))
                })
            
            return {"events": result, "count": len(result)}
        except Exception as e:
            return {"events": [], "error": str(e)}
    
    @app.get("/api/alerts")
    async def get_alerts(last_id: str = "$", count: int = 20):
        try:
            if last_id == "$":
                last_id = "0"
            
            alerts = redis_client.xread(
                {REDIS_ALERTS_STREAM: last_id},
                count=count,
                block=5000
            )
            
            result = []
            new_last_id = last_id
            if alerts:
                for stream_name, stream_alerts in alerts:
                    for alert_id, alert_data in stream_alerts:
                        result.append({
                            "id": alert_id,
                            "alert_id": alert_data.get("id", ""),
                            "rule_id": alert_data.get("rule_id", ""),
                            "rule_name": alert_data.get("rule_name", ""),
                            "severity": alert_data.get("severity", ""),
                            "pid": int(alert_data.get("pid", 0)),
                            "process_name": alert_data.get("process_name", ""),
                            "syscall_name": alert_data.get("syscall_name", ""),
                            "args": alert_data.get("args", ""),
                            "timestamp": int(alert_data.get("timestamp", 0)),
                            "triggered_at": int(alert_data.get("triggered_at", 0))
                        })
                        new_last_id = alert_id
            
            return {"alerts": result, "last_id": new_last_id}
        except Exception as e:
            logger.error(f"Error fetching alerts: {e}")
            return {"alerts": [], "last_id": last_id, "error": str(e)}
    
    @app.get("/api/alerts/latest")
    async def get_latest_alerts(count: int = 20):
        try:
            try:
                stream_info = redis_client.xinfo_stream(REDIS_ALERTS_STREAM)
                last_id = stream_info.get("last-generated-id", "0-0")
            except:
                return {"alerts": [], "count": 0}
            
            alerts = redis_client.xrevrange(
                REDIS_ALERTS_STREAM,
                max=last_id,
                min="-",
                count=count
            )
            
            result = []
            for alert_id, alert_data in reversed(alerts):
                result.append({
                    "id": alert_id,
                    "alert_id": alert_data.get("id", ""),
                    "rule_id": alert_data.get("rule_id", ""),
                    "rule_name": alert_data.get("rule_name", ""),
                    "severity": alert_data.get("severity", ""),
                    "pid": int(alert_data.get("pid", 0)),
                    "process_name": alert_data.get("process_name", ""),
                    "syscall_name": alert_data.get("syscall_name", ""),
                    "args": alert_data.get("args", ""),
                    "timestamp": int(alert_data.get("timestamp", 0)),
                    "triggered_at": int(alert_data.get("triggered_at", 0))
                })
            
            return {"alerts": result, "count": len(result)}
        except Exception as e:
            return {"alerts": [], "error": str(e)}
    
    @app.delete("/api/alerts")
    async def clear_alerts():
        try:
            redis_client.delete(REDIS_ALERTS_STREAM)
            return {"status": "ok", "message": "Alerts cleared"}
        except Exception as e:
            return {"status": "error", "error": str(e)}
    
    @app.get("/api/rules")
    async def get_rules():
        try:
            rules = rule_engine.get_all_rules()
            return {"rules": [r.dict() for r in rules]}
        except Exception as e:
            return {"error": str(e)}
    
    @app.post("/api/rules")
    async def create_rule(rule: AlertRule):
        try:
            rule_engine.add_rule(rule)
            return {"status": "ok", "rule": rule.dict()}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    @app.delete("/api/rules/{rule_id}")
    async def delete_rule(rule_id: str):
        try:
            if rule_engine.delete_rule(rule_id):
                return {"status": "ok", "message": f"Rule {rule_id} deleted"}
            else:
                raise HTTPException(status_code=404, detail="Rule not found")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    
    @app.get("/api/health")
    async def health():
        try:
            redis_health = redis_client.ping()
            return {"status": "ok", "redis": redis_health}
        except Exception as e:
            return {"status": "error", "redis": False, "error": str(e)}
    
    @app.delete("/api/events")
    async def clear_events():
        try:
            redis_client.delete(REDIS_STREAM)
            return {"status": "ok", "message": "Stream cleared"}
        except Exception as e:
            return {"status": "error", "error": str(e)}
    
    @app.get("/api/stats")
    async def get_stats():
        try:
            info = redis_client.xinfo_stream(REDIS_STREAM)
            groups = redis_client.xinfo_groups(REDIS_STREAM)
            return {
                "stream_length": info.get("length", 0),
                "last_id": info.get("last-generated-id", ""),
                "groups": len(groups) if groups else 0,
                "radix_tree_keys": info.get("radix-tree-keys", 0)
            }
        except Exception as e:
            return {"error": str(e)}
    
    return app, redis_client, rule_engine

async def serve_grpc(redis_client, rule_engine):
    server = grpc.aio.server(futures.ThreadPoolExecutor(max_workers=10))
    syscall_pb2_grpc.add_SyscallCollectorServicer_to_server(
        SyscallCollectorServicer(redis_client, rule_engine), server
    )
    server.add_insecure_port("[::]:50051")
    await server.start()
    logger.info("gRPC server started on port 50051")
    await server.wait_for_termination()

async def main():
    app, redis_client, rule_engine = create_app()
    
    grpc_task = asyncio.create_task(serve_grpc(redis_client, rule_engine))
    
    config = uvicorn.Config(
        app, 
        host="0.0.0.0", 
        port=8000, 
        log_level="info",
        reload=False
    )
    server = uvicorn.Server(config)
    
    logger.info("Starting Collector services...")
    logger.info("HTTP API: http://localhost:8000")
    logger.info("gRPC: localhost:50051")
    
    await asyncio.gather(
        grpc_task,
        server.serve()
    )

if __name__ == "__main__":
    asyncio.run(main())

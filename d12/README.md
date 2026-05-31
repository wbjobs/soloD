# Syscall Monitor Platform

A distributed platform for monitoring process system calls using eBPF, gRPC, Redis, and React.

## Architecture

```
┌─────────────────┐     gRPC Stream     ┌─────────────────┐
│   Go Agent      │ ───────────────────> │  Python Collector│
│  (eBPF + libbpf)│                      │  (FastAPI + gRPC)│
└─────────────────┘                      └────────┬────────┘
                                                    │
                                                    ▼
                                            ┌─────────────┐
                                            │  Redis     │
                                            │  Stream    │
                                            └──────┬──────┘
                                                   │
                                                   ▼
                                            ┌─────────────┐
                                            │ React       │
                                            │ Frontend    │
                                            └─────────────┘
```

## Components

### 1. Go Agent (`agent/`)
- Uses `libbpfgo` to load eBPF program
- Attaches to `sys_enter_openat` and `sys_enter_read` tracepoints
- Streams captured events via gRPC to collector
- Supports target PID filtering

**Requirements:**
- Linux kernel >= 5.8
- Go >= 1.21
- clang/llvm
- libbpf-dev

**Build & Run:**
```bash
cd agent
make build
sudo ./syscall-agent <PID> [collector-address]
```

### 2. Python Collector (`collector/`)
- gRPC server receiving syscall events from agents
- FastAPI HTTP server providing REST API
- Stores events in Redis Stream

**Requirements:**
- Python >= 3.9
- Redis server

**Setup & Run:**
```bash
cd collector
pip install -r requirements.txt
python build_proto.py
python server.py
```

**API Endpoints:**
- `GET /api/events?last_id=0&count=50` - Fetch events
- `DELETE /api/events` - Clear all events
- `GET /api/health` - Health check
- gRPC: `[::]:50051`

### 3. React Frontend (`frontend/`)
- Real-time event display with polling
- Statistics dashboard
- Dark theme UI

**Setup & Run:**
```bash
cd frontend
npm install
npm start
```

## Quick Start

1. **Start Redis:**
```bash
redis-server
```

2. **Start Collector:**
```bash
cd collector
pip install -r requirements.txt
python build_proto.py
python server.py
```

3. **Start Frontend:**
```bash
cd frontend
npm install
npm start
```

4. **Start Agent (in another terminal):**
```bash
cd agent
make build
sudo ./syscall-agent 1234  # Replace 1234 with target PID
```

5. Open browser at `http://localhost:3000`

## Features

- ✅ eBPF-based syscall tracing (low overhead)
- ✅ Capture `openat` and `read` syscalls
- ✅ Target PID filtering
- ✅ gRPC streaming from agent to collector
- ✅ Redis Stream for event storage
- ✅ Real-time web UI
- ✅ Event statistics

## Proto Generation

**Go:**
```bash
cd proto
protoc --go_out=../agent --go_opt=paths=source_relative \
    --go-grpc_out=../agent --go-grpc_opt=paths=source_relative \
    syscall.proto
```

**Python:**
```bash
cd collector
python build_proto.py
```

## Troubleshooting

### Agent Issues
- **Permission denied:** Agent requires root privileges for eBPF
- **bpf object not found:** Run `make build` first
- **gRPC connection refused:** Ensure collector is running

### Collector Issues
- **Redis connection error:** Ensure Redis is running on localhost:6379
- **Proto import error:** Run `python build_proto.py`

### Kernel Requirements
The eBPF program uses CO-RE (Compile Once - Run Everywhere) approach. Ensure your kernel has BTF enabled:
```bash
cat /boot/config-$(uname -r) | grep CONFIG_DEBUG_INFO_BTF
```

## License

MIT

# Build & Deployment Guide

## Prerequisites

### Linux (for Go Agent)
```bash
# Install dependencies
sudo apt update
sudo apt install -y clang llvm libbpf-dev libelf-dev zlib1g-dev golang-go

# Install protoc
wget https://github.com/protocolbuffers/protobuf/releases/download/v24.3/protoc-24.3-linux-x86_64.zip
unzip protoc-24.3-linux-x86_64.zip -d protoc
sudo cp protoc/bin/protoc /usr/local/bin/
sudo cp -r protoc/include/* /usr/local/include/

# Install Go protoc plugins
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest
export PATH="$PATH:$(go env GOPATH)/bin"
```

### Python (for Collector)
```bash
pip install fastapi uvicorn redis grpcio grpcio-tools pydantic
```

### Redis
```bash
# Install Redis
sudo apt install -y redis-server

# Start Redis
redis-server --daemonize yes
```

## Build Steps

### 1. Generate Protobuf Files

#### Go Protobuf
```bash
cd d12
mkdir -p agent/proto
protoc --go_out=agent/proto --go_opt=paths=source_relative \
    --go-grpc_out=agent/proto --go-grpc_opt=paths=source_relative \
    proto/syscall.proto
```

#### Python Protobuf
```bash
cd collector
python build_proto.py
```

### 2. Build Go Agent
```bash
cd agent

# Download dependencies
go mod download
go mod tidy

# Build eBPF object and Go binary
make build
# Or manually:
# make bpf
# CGO_ENABLED=1 GOOS=linux GOARCH=amd64 go build -o syscall-agent main.go
```

### 3. Verify Build
```bash
# Check binary was created
ls -la syscall-agent

# Check eBPF object
ls -la bpf/syscall.bpf.o
```

## Running the System

### Terminal 1: Start Collector
```bash
cd collector
python server.py
```

### Terminal 2: Start Frontend
```bash
cd frontend
npm install
npm start
```

### Terminal 3: Start Agent (Linux only, requires root)
```bash
cd agent
# Monitor your current shell (or any PID)
sudo ./syscall-agent $$

# Or monitor a specific process:
# sudo ./syscall-agent 1234
```

## API Endpoints

### HTTP API (Port 8000)
- `GET /api/events?last_id=0&count=50` - Stream events with long polling
- `GET /api/events/latest?count=50` - Get latest events (for initial load)
- `DELETE /api/events` - Clear all events
- `GET /api/health` - Health check
- `GET /api/stats` - Redis Stream statistics

### gRPC API (Port 50051)
- `StreamSyscalls` - Bi-directional streaming for events

## Troubleshooting

### Go Build Issues
1. **CGO errors**: Ensure `CGO_ENABLED=1` and libbpf-dev is installed
2. **libbpf not found**: Check `/usr/include/bpf/libbpf.h` exists
3. **eBPF compile errors**: Make sure clang is installed and in PATH

### Agent Runtime Issues
1. **Permission denied**: Run with `sudo` (required for eBPF tracepoints)
2. **Connection refused**: Ensure collector is running on port 50051
3. **No events**: Verify target PID is correct and process is making syscalls

### Collector Issues
1. **Redis connection**: Ensure Redis is running on localhost:6379
2. **Proto import errors**: Run `python build_proto.py`
3. **gRPC errors**: Check firewall settings for port 50051

### Redis Stream Debugging
```bash
# Connect to Redis CLI
redis-cli

# Check stream length
XLEN syscall_events

# Read latest events
XREVRANGE syscall_events + - COUNT 10

# Stream info
XINFO STREAM syscall_events

# Delete stream
DEL syscall_events
```

## Testing the Flow

1. Start Redis
2. Start Collector (shows "gRPC server started on port 50051")
3. Start Agent with a test PID
4. Generate some file I/O on the target process
5. Check collector logs for "Received X events"
6. Open frontend at http://localhost:3000 to see events

## Expected Output

### Agent
```
Starting syscall monitor for PID 1234...
Connecting to collector at localhost:50051...
Connected to collector successfully
Monitoring started. Press Ctrl+C to stop.
Sent 10 events...
Sent 20 events...
```

### Collector
```
INFO: Starting Collector services...
INFO: HTTP API: http://localhost:8000
INFO: gRPC: localhost:50051
INFO: New gRPC stream connection established
INFO: Received 10 events. Last ID: 1718...
INFO: Received 20 events. Last ID: 1718...
```

### Frontend
- Dark theme dashboard
- Real-time events appearing
- Statistics showing total, openat, and read counts

# 系统调用监控系统

这是一个基于 eBPF 的系统调用监控系统，可以实时监控指定进程的文件打开操作，并通过 Web 界面可视化展示。

## 系统架构

```
┌─────────────────┐    Unix Socket    ┌─────────────────┐    WebSocket    ┌─────────────────┐
│  Python (eBPF)  │ ────────────────► │   Go 桥接服务   │ ──────────────► │  Vue.js 前端    │
│  后端监控程序   │                   │                 │                 │  实时展示页面   │
└─────────────────┘                   └─────────────────┘                 └─────────────────┘
         ▲                                    │
         │                            HTTP API
         │ Control Socket                    │
         └────────────────────────────────────┘
```

## 新功能特性

### v2.0 版本新增

1. **动态 PID 控制** - 无需重启后端即可切换监控的进程
   - Web 界面输入 PID，点击即可切换
   - 支持 PID 0（监控所有进程）

2. **实时频率图表** - 使用 Chart.js 展示
   - 近10秒每秒文件打开次数
   - 当前速率统计
   - 10秒总数统计

3. **HTTP API 接口**
   - `POST /api/set-pid` - 设置监控 PID
   - `GET /api/get-pid` - 获取当前监控 PID
   - `GET /api/health` - 获取系统状态

---

## Ubuntu 22.04 完整安装指南

### 1. 系统要求检查

```bash
# 检查内核版本 (需要 4.15+, Ubuntu 22.04 默认是 5.15+)
uname -r

# 检查 tracepoint 是否可用
ls /sys/kernel/debug/tracing/events/syscalls/sys_enter_openat/

# 如果上面命令失败，需要先挂载 debugfs
sudo mount -t debugfs none /sys/kernel/debug
```

### 2. 安装系统依赖

```bash
# 更新包列表
sudo apt-get update

# 安装编译工具和内核头文件
sudo apt-get install -y build-essential
sudo apt-get install -y linux-headers-$(uname -r)

# 安装 bcc 和 Python 绑定
sudo apt-get install -y bpfcc-tools
sudo apt-get install -y python3-bpfcc
sudo apt-get install -y libbpfcc-dev

# 验证 bcc 安装
dpkg -l | grep bpfcc

# 验证 Python 模块
python3 -c "from bcc import BPF; print('bcc module loaded successfully')"
```

### 3. 安装 Go

```bash
# 下载 Go (如果还没安装)
cd /tmp
wget https://go.dev/dl/go1.21.0.linux-amd64.tar.gz
sudo tar -C /usr/local -xzf go1.21.0.linux-amd64.tar.gz

# 添加到 PATH (在 ~/.bashrc 或 ~/.zshrc 中)
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc
source ~/.bashrc

# 验证安装
go version
```

### 4. 安装 Node.js

```bash
# 使用 nvm 安装 Node.js (推荐)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc

# 安装 Node.js 18 LTS
nvm install 18
nvm use 18

# 验证
node --version
npm --version
```

### 5. 安装项目依赖

```bash
# 进入项目目录
cd /path/to/d62

# 安装 Go 依赖
go mod tidy

# 安装前端依赖
cd frontend
npm install
cd ..
```

---

## 运行步骤

### 重要：启动顺序

1. **首先**启动 Python 后端（需要 root）
2. **然后**启动 Go 桥接服务
3. **最后**访问前端页面

### 步骤 1: 启动 Python 后端监控程序

```bash
# 进入后端目录
cd backend

# 启动监控（需要 sudo）
# 用法: sudo python3 syscall_monitor.py <pid>
# 0 表示监控所有进程

# 示例 1: 监控所有进程
sudo python3 syscall_monitor.py 0

# 示例 2: 监控特定 PID
sudo python3 syscall_monitor.py 1234

# 示例 3: 监控当前 shell
echo $$  # 获取当前 shell 的 PID
sudo python3 syscall_monitor.py $(echo $$)
```

成功启动后你会看到：
```
============================================================
  System Call Monitor - eBPF Based
============================================================

[SETUP] Setting up Unix Domain Socket...
[SETUP] ✓ Unix Domain Socket ready at /tmp/syscall_monitor.sock

[CONN] Waiting for Go service to connect...
[CONN] (Start the Go service in another terminal: go run cmd/websocket_bridge.go)
```

### 步骤 2: 启动 Go 桥接服务

**打开一个新的终端窗口：**

```bash
# 进入项目目录
cd /path/to/d62

# 启动 Go 服务
go run cmd/websocket_bridge.go
```

成功启动后你会看到：
```
============================================================
  System Call Monitor - WebSocket Bridge
============================================================

[UNIX] Attempting to connect to /tmp/syscall_monitor.sock...
[UNIX] ✓ Successfully connected to Unix socket
[UNIX] Reading events from socket...

[HTTP] WebSocket server starting on :8080
[HTTP] Access: http://localhost:8080
```

### 步骤 3: 构建并访问前端

**开发模式：**

```bash
# 打开新终端
cd frontend
npm run dev
```

然后访问 http://localhost:3000

**生产模式（推荐）：**

```bash
# 安装前端依赖（首次运行）
cd frontend
npm install

# 构建前端
npm run build
cd ..
```

然后直接访问 http://localhost:8080（由 Go 服务托管静态文件）

---

## API 接口文档

所有 API 端点都在 Go 服务的 `:8080` 端口上。

### 1. 设置监控 PID

**POST** `/api/set-pid`

设置要监控的进程 PID。

**请求体：**
```json
{
  "pid": 1234
}
```

使用 PID `0` 监控所有进程。

**响应：**
```json
{
  "status": "ok",
  "pid": 1234
}
```

**示例：**
```bash
curl -X POST http://localhost:8080/api/set-pid \
  -H "Content-Type: application/json" \
  -d '{"pid": 0}'
```

### 2. 获取当前监控 PID

**GET** `/api/get-pid`

获取当前正在监控的 PID。

**响应：**
```json
{
  "status": "ok",
  "pid": 0
}
```

**示例：**
```bash
curl http://localhost:8080/api/get-pid
```

### 3. 获取系统健康状态

**GET** `/api/health`

获取系统运行状态信息。

**响应：**
```json
{
  "connected_to_unix": true,
  "current_pid": 0,
  "event_count": 1234,
  "client_count": 2
}
```

**示例：**
```bash
curl http://localhost:8080/api/health
```

---

## WebSocket 数据格式

WebSocket 端点：`ws://localhost:8080/ws`

每个事件的 JSON 格式：
```json
{
  "pid": 1234,
  "comm": "bash",
  "filename": "/etc/passwd",
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

---

## 前端功能说明

### 控制面板

- **PID 输入框**：输入要监控的进程 ID
- **设置监控按钮**：点击发送设置请求到后端
- **当前 PID 显示**：显示当前正在监控的 PID
- **回车键支持**：输入框中按回车键快速设置

### 统计卡片

1. **总事件数**：自页面加载以来的文件打开总数
2. **唯一进程数**：涉及的不同进程数量
3. **打开/秒**：当前秒的实时速率
4. **近10秒总数**：过去10秒的累计总数

### 实时图表

- 使用 Chart.js 柱状图展示
- 显示近10秒每秒的文件打开次数
- 最右侧"现在"表示当前秒
- 数据每秒自动滚动更新

### 事件列表

- 最新事件显示在最上方
- 新事件有高亮动画效果
- 显示 PID、进程名、时间和文件名
- 超过500条自动滚动删除旧数据
cd ..
```

然后直接访问 http://localhost:8080（由 Go 服务托管）

---

## 故障排除

### Python 后端常见问题

#### 问题 1: ImportError - 找不到 bcc 模块

**错误信息：**
```
ERROR: Failed to import bcc module!
```

**解决方案：**
```bash
# 1. 确保已安装 python3-bpfcc
sudo apt-get install -y python3-bpfcc

# 2. 检查 Python 路径
python3 -c "import sys; print(sys.path)"

# 3. 可能需要用 sudo python3 运行
sudo python3 syscall_monitor.py 0
```

#### 问题 2: eBPF tracepoint 挂载失败

**错误信息：**
```
[ERROR] Failed to attach eBPF tracepoint!
```

**解决方案：**
```bash
# 1. 确保以 root 运行
sudo python3 syscall_monitor.py 0

# 2. 检查内核是否支持 tracepoints
cat /boot/config-$(uname -r) | grep CONFIG_KPROBE_EVENTS
cat /boot/config-$(uname -r) | grep CONFIG_TRACEPOINTS

# 3. 检查 bpf 相关配置
cat /boot/config-$(uname -r) | grep CONFIG_BPF
cat /boot/config-$(uname -r) | grep CONFIG_BPF_SYSCALL

# 4. 检查 sys_enter_openat tracepoint 是否存在
sudo ls /sys/kernel/debug/tracing/events/syscalls/ | grep openat
```

#### 问题 3: 权限不足

**错误信息：**
```
Permission denied
```

**解决方案：**
```bash
# 必须使用 sudo 运行
sudo python3 syscall_monitor.py 0
```

### Go 服务常见问题

#### 问题 1: 无法连接 Unix Socket

**错误信息：**
```
[UNIX] Waiting for socket file... (attempt X/60)
```

**可能原因：**
- Python 后端未启动
- Socket 文件路径不匹配

**解决方案：**
```bash
# 检查 Python 后端是否正在运行
ps aux | grep syscall_monitor

# 检查 socket 文件是否存在
ls -la /tmp/syscall_monitor.sock

# 手动清理 stale socket
sudo rm -f /tmp/syscall_monitor.sock
```

#### 问题 2: Go 依赖缺失

**错误信息：**
```
cannot find package "github.com/gorilla/websocket"
```

**解决方案：**
```bash
go get github.com/gorilla/websocket
go mod tidy
```

### 前端常见问题

#### 问题 1: WebSocket 连接失败

**浏览器控制台错误：**
```
WebSocket connection to 'ws://localhost:8080/ws' failed
```

**解决方案：**
- 确保 Go 服务正在运行
- 检查端口 8080 是否被占用
- 查看浏览器控制台网络标签

#### 问题 2: npm install 失败

**解决方案：**
```bash
# 清理缓存
npm cache clean --force

# 删除 node_modules 重新安装
rm -rf node_modules package-lock.json
npm install
```

---

## 验证安装的快速测试脚本

创建一个 `test_setup.sh` 文件：

```bash
#!/bin/bash

echo "=== Testing System Setup ==="

echo -e "\n1. Checking kernel version..."
uname -r

echo -e "\n2. Checking bcc tools..."
which bpftrace
which python3-bpfcc 2>/dev/null || echo "python3-bpfcc should be installed"

echo -e "\n3. Testing Python bcc module..."
python3 -c "from bcc import BPF; print('✓ bcc Python module works')" 2>/dev/null || echo "✗ bcc module not found (run with sudo?)"

echo -e "\n4. Checking Go..."
go version 2>/dev/null || echo "✗ Go not found"

echo -e "\n5. Checking Node.js..."
node --version 2>/dev/null || echo "✗ Node.js not found"
npm --version 2>/dev/null || echo "✗ npm not found"

echo -e "\n6. Checking tracepoint availability..."
if [ -d "/sys/kernel/debug/tracing/events/syscalls/sys_enter_openat" ]; then
    echo "✓ sys_enter_openat tracepoint available"
else
    echo "✗ tracepoint not found (may need sudo mount debugfs)"
fi

echo -e "\n=== Done ==="
```

运行：
```bash
chmod +x test_setup.sh
sudo ./test_setup.sh
```

---

## 性能调优

### 增加 perf buffer 大小

在 Python 脚本中修改：
```python
# 增大 perf buffer 到 8MB (默认是 4MB per CPU)
b["events"].open_perf_buffer(handle_event, page_cnt=8)
```

### 调整缓冲区大小

在 Go 中增加 broadcast 缓冲区：
```go
broadcast:  make(chan []byte, 5000),  # 从 1000 增加到 5000
```

---

## 安全说明

1. **root 权限**：Python 后端需要 root 权限来加载 eBPF 程序
2. **Unix Socket 权限**：Socket 文件设置为 0o666，允许所有用户连接
3. **WebSocket**：默认允许所有来源连接（生产环境应限制）

---

## 卸载清理

```bash
# 清理 socket 文件
sudo rm -f /tmp/syscall_monitor.sock

# 卸载 bcc (如果需要)
sudo apt-get remove -y bpfcc-tools python3-bpfcc libbpfcc-dev
```

---

## 项目文件结构

```
d62/
├── backend/
│   └── syscall_monitor.py    # Python eBPF 监控程序 (已增强)
├── cmd/
│   └── websocket_bridge.go   # Go WebSocket 桥接服务 (已增强)
├── frontend/
│   ├── src/
│   │   ├── App.vue
│   │   └── main.js
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
├── go.mod
└── README_SYSCALL.md         # 本文档
```

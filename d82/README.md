# eBPF Process Monitor

一个使用 eBPF (Extended Berkeley Packet Filter) 技术监控特定进程系统调用的高并发 Go 后端服务。针对 Linux Kernel 5.15+ 环境进行了深度优化，解决了高频率 IO 场景下的数据乱序和丢包问题。

## 功能特性

- 监控 `openat` 系统调用（文件打开操作）
- 监控 `execve` 系统调用（程序执行操作）
- 高并发事件处理，支持每秒数十万次系统调用
- 自动排序和去重，确保事件时序正确性
- 实时通过 RESTful API 获取监控日志
- 支持动态添加/移除监控目标进程
- 完整的性能统计指标
- 高性能 8MB 环形缓冲区（Ring Buffer）

## 高并发优化特性

### v3.0 版本新增功能：

1. **动态规则热更新**
   - 基于 eBPF Map 的忽略规则管理
   - 无需重启程序即可动态增删过滤规则
   - 支持路径前缀匹配和精确匹配
   - 规则持久化支持，重启后自动恢复

2. **高性能路径过滤**
   - 内核态路径匹配，零性能损耗
   - 支持最多 100 条忽略规则
   - 路径前缀最长 63 字符

### v2.0 版本修复的问题：

1. **缓冲区大小优化**
   - Ring Buffer 从 256KB 增加到 8MB
   - 有效避免高并发场景下的缓冲区溢出

2. **数据结构对齐**
   - 使用 `__attribute__((packed))` 确保内核与用户态数据结构完全对齐
   - 消除解析错误导致的数据丢失

3. **唤醒机制优化**
   - 采用 `BPF_RB_FORCE_WAKEUP` 标志
   - 确保事件及时送达用户态，减少延迟

4. **序列号追踪**
   - 在内核中生成全局递增序列号
   - 用户态检测序列号跳变，精确统计丢包数

5. **多 Worker 并发处理**
   - 4 个 Worker Goroutine 并行处理事件
   - 解耦 Ring Buffer 读取与事件解析

6. **批量排序机制**
   - 按批次（100 个事件）进行排序处理
   - 同时支持序列号和内核时间戳双重排序
   - 10ms 定时刷新确保低延迟

7. **去重处理**
   - 基于序列号去重，避免重复事件

8. **完整的性能统计**
   - 总事件数
   - 丢弃事件数
   - 丢失序列号数
   - 批处理计数

## 系统要求

- Linux 内核 5.8+ (推荐 5.15+，支持 BPF CO-RE)
- Go 1.21+
- Clang/LLVM 14+
- root 权限（加载 eBPF 程序需要）

## 安装依赖

```bash
# 安装系统依赖
sudo apt-get update
sudo apt-get install -y clang-14 llvm-14 libbpf-dev linux-tools-common linux-tools-generic

# 安装 Go 依赖
make deps
```

## 编译项目

```bash
# 完整编译（生成 eBPF 绑定 + Go 二进制）
make build

# 或仅生成 eBPF Go 绑定
make generate
```

## 使用方法

### 启动监控服务

```bash
# 监控指定 PID 的进程
sudo ./ebpf-monitor -pid=1234

# 指定 API 服务器地址
sudo ./ebpf-monitor -pid=1234 -addr=:9090

# 启用规则持久化（启动时加载，退出时保存）
sudo ./ebpf-monitor -pid=1234 -rules=./ignore-rules.json
```

### 使用 Make 运行

```bash
make run PID=1234
```

## RESTful API

所有 API 端点都在 `/api/v1` 前缀下。

### 健康检查（含统计信息）

```bash
GET /api/v1/health
```

响应示例：
```json
{
  "success": true,
  "status": "running",
  "stats": {
    "TotalEvents": 10245,
    "DroppedEvents": 0,
    "OutOfOrderCount": 0,
    "BatchCount": 103,
    "LostSequence": 0
  }
}
```

### 获取性能统计

```bash
GET /api/v1/stats
```

### 获取所有事件

```bash
GET /api/v1/events
```

响应示例：
```json
{
  "success": true,
  "count": 5,
  "data": [
    {
      "pid": 1234,
      "tgid": 1234,
      "timestamp": "2024-01-01T12:00:00Z",
      "kernel_time_ns": 1234567890123,
      "sequence": 1001,
      "cpu": 2,
      "comm": "bash",
      "filename": "/etc/passwd",
      "syscall": "openat"
    }
  ]
}
```

### 获取特定 PID 的事件

```bash
GET /api/v1/events/:pid
```

### 清空所有事件

```bash
DELETE /api/v1/events
```

### 添加监控目标 PID

```bash
POST /api/v1/targets
Content-Type: application/json

{
  "pid": 5678
}
```

### 移除监控目标 PID

```bash
DELETE /api/v1/targets/:pid
```

## 项目结构

```
e:\soloD\d82\
├── ebpf/
│   ├── monitor.bpf.c      # C 语言 eBPF 内核程序（v2.0 优化版）
│   └── loader.go          # Go 用户态加载器（多 Worker + 批量排序）
├── cmd/
│   └── main.go            # 主程序入口
├── pkg/
│   └── logger/
│       └── logger.go      # 日志存储模块（带环形缓冲区和自动排序）
├── api/
│   └── handler.go         # REST API 处理器
├── go.mod                 # Go 模块定义
├── Makefile               # 构建脚本
└── README.md              # 项目文档
```

## 工作原理

1. **eBPF 内核程序**：使用 tracepoint 挂载到 `sys_enter_openat` 和 `sys_enter_execve` 系统调用入口点

2. **序列号生成**：使用 per-CPU 数组和原子操作生成全局递增序列号

3. **进程过滤**：通过 BPF Map 存储需要监控的 PID，只收集目标进程的事件

4. **事件传输**：使用 8MB BPF Ring Buffer + 强制唤醒机制，高效传输事件

5. **多 Worker 并发处理**：4 个 Worker Goroutine 并行解析事件

6. **批量排序和去重**：按批次（100 个或 10ms）排序，基于序列号去重

7. **有序存储**：查询时再次按序列号和内核时间戳排序，确保时序正确

8. **REST API**：通过 Gin 框架提供 HTTP 接口，实时查询监控日志和性能统计

## 性能指标说明

- **TotalEvents**：成功处理的总事件数
- **DroppedEvents**：因缓冲区满被丢弃的事件数
- **LostSequence**：检测到的序列号跳变（可能丢包）
- **BatchCount**：已完成的批处理数

## 注意事项

1. 必须使用 root 权限运行程序才能加载 eBPF 程序
2. 确保系统内核支持 BPF CO-RE (Compile Once - Run Everywhere)
3. eBPF 程序需要使用 bpf2go 工具预编译为 Go 代码
4. Windows 系统无法直接运行，需要在 Linux 环境或 WSL2 中运行
5. 监控高 IO 进程时，建议使用多核 CPU 以获得最佳性能

## 清理

```bash
make clean
```

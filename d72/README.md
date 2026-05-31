# 系统级监控工具 - eBPF 系统调用监控

这是一个基于 eBPF 的系统级监控工具，用于实时监控指定进程（如 nginx）的 `openat` 和 `read` 系统调用。

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                        用户空间                               │
│  ┌──────────────┐      ┌──────────────┐      ┌───────────┐  │
│  │  Vue.js 前端 │◄─────┤  Gin REST API│◄─────┤  Go 程序  │  │
│  │  + ECharts   │      │              │      │           │  │
│  └──────────────┘      └──────────────┘      └─────┬─────┘  │
│                                                     │        │
└─────────────────────────────────────────────────────┼────────┘
                                                       │ perf buffer
                                                       │
┌─────────────────────────────────────────────────────┼────────┐
│                        内核空间                               │
│  ┌───────────────────────────────────────────────────┐      │
│  │              eBPF 程序 - tracepoint               │      │
│  │  sys_enter_openat, sys_exit_openat                │      │
│  │  sys_enter_read, sys_exit_read                    │      │
│  └───────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

## 功能特性

- **内核级监控**: 使用 eBPF tracepoint 在内核层面捕获系统调用，低开销
- **进程过滤**: 仅监控指定进程（默认为 nginx）
- **实时数据**: 通过 perf buffer 将内核事件实时发送到用户空间
- **REST API**: 提供统计数据和事件查询接口
- **可视化面板**: Vue.js + ECharts 实时展示系统调用频率和趋势

## 目录结构

```
.
├── backend/
│   ├── bpf/
│   │   └── syscalls.c          # eBPF C 代码
│   ├── main.go                 # Go 主程序
│   ├── go.mod                  # Go 模块文件
│   └── Makefile                # 编译脚本
├── frontend/
│   └── index.html              # Vue.js 前端页面
└── README.md
```

## 前置要求

### 系统要求

- Linux 内核版本 >= 5.8 (支持 BPF CO-RE)
- root 权限

### 软件依赖

- Go 1.21+
- Clang/LLVM
- libbpf-dev

### 安装依赖 (Ubuntu/Debian)

```bash
sudo apt-get update
sudo apt-get install -y golang clang llvm libbpf-dev linux-headers-$(uname -r)
```

## 编译与运行

### 1. 编译后端

```bash
cd backend
make generate
go build -o sysmon
```

### 2. 运行后端程序

```bash
sudo ./sysmon
```

程序将在 `http://localhost:8080` 启动 API 服务。

### 3. 启动 nginx (被监控进程)

```bash
sudo nginx
```

### 4. 打开前端

在浏览器中打开 `frontend/index.html` 文件即可看到监控面板。

## API 接口

### 获取统计数据

```
GET /api/stats
```

响应示例:
```json
{
  "openat_count": 100,
  "read_count": 200,
  "events": [...],
  "uptime": "1m30s"
}
```

### 获取事件列表

```
GET /api/events
```

### 获取频率统计

```
GET /api/frequency
```

响应示例:
```json
{
  "openat_frequency": 10.5,
  "read_frequency": 20.3,
  "openat_count": 100,
  "read_count": 200,
  "uptime_seconds": 60
}
```

## 前端功能

- **实时统计卡片**: 显示调用总数和频率
- **趋势折线图**: 展示系统调用频率随时间的变化
- **分布饼图**: 显示两种系统调用的占比
- **事件表格**: 列出最近的系统调用事件详情

## 自定义配置

### 修改监控目标进程

编辑 `backend/bpf/syscalls.c` 中的 `is_target_process` 函数:

```c
static inline bool is_target_process(const char *comm) {
    const char *target = "your-process-name";  // 修改此处
    // ...
}
```

然后重新编译。

### 修改 API 端口

编辑 `backend/main.go` 中的 `Run` 调用:

```go
log.Fatal(r.Run(":8080"))  // 修改端口号
```

## 技术栈

**后端**:
- Go 1.21
- Cilium eBPF library
- Gin Web Framework
- gin-contrib/cors (完善的 CORS 支持)

**前端**:
- Vue.js 3 (Composition API)
- ECharts 5

## 主要修复

### 1. eBPF 权限和加载问题
- **Root 权限检测**：程序启动时自动检测是否有 root 权限
- **优雅降级**：如果 eBPF 加载失败（权限不足或内核不支持），自动切换到**模拟数据模式**
- **错误处理**：所有 eBPF 相关操作都有完善的错误处理和日志输出
- **Demo 模式**：即使没有 Linux 环境也能运行和测试前端

### 2. Gin 路由和 CORS 配置
- 使用 **gin-contrib/cors** 官方中间件，提供完整的 CORS 支持
- 显式设置 **Content-Type: application/json** 响应头
- 路由分组管理 (`/api/*`)
- 添加 **/api/health** 健康检查端点
- 支持所有 HTTP 方法和标准请求头
- 12 小时的预检请求缓存 (MaxAge)

## 注意事项

1. 必须使用 root 权限运行后端程序
2. 确保目标进程（如 nginx）正在运行
3. 确保系统已安装正确版本的 Linux headers
4. 前端页面使用 CDN 资源，需要网络连接


### eBPF 程序加载失败（真实模式）
- 检查内核版本是否 >= 5.8
- 检查是否安装了正确的 linux-headers
- 确认是否使用 sudo 运行

### 提示
- 如果不想配置 eBPF 环境，直接以普通用户运行程序即可进入 Demo 模式

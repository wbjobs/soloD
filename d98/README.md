# 安全的Wasm函数计算平台 (Secure Wasm FaaS)

一个基于Go + Wasmtime + eBPF的安全函数计算平台，支持CPU时间和内存配额限制。

## 核心特性

### 🛡️ 安全机制
- **100ms硬超时保护**: 防止恶意代码无限循环
- **5MB内存配额**: 限制内存分配防止内存耗尽攻击
- **双重内存监控**: Wasmtime限制 + eBPF系统调用监控
- **Wasmtime Fuel机制**: 限制指令执行数量
- **eBPF进程监控** (Linux): 内核级CPU和内存使用监控
- **进程组支持**: 监控整个进程组而非单个进程
- **Wasm沙箱隔离**: WebAssembly天然安全隔离

### 📊 详细错误分类
| 错误类型 | 说明 | HTTP状态码 |
|---------|------|-----------|
| `timeout` | 执行超时 | 408 |
| `fuel_exhausted` | 指令配额耗尽 | 408 |
| `memory_limit` | 内存超限 | 507 |
| `trap` | Wasm陷阱 | 500 |
| `function_not_found` | 函数不存在 | 404 |
| `module_load` | 模块加载失败 | 500 |
| `instantiation` | 实例化失败 | 500 |
| `invalid_result` | 返回类型不支持 | 500 |

### 🌐 HTTP API
- 文件上传 (`POST /upload`)
- 函数执行 (`POST /execute/{id}`)
- 函数列表 (`GET /functions`)
- 健康检查 (`GET /health`)
- 请求日志中间件
- Panic恢复中间件

## 项目结构

```
wasm-faas/
├── cmd/
│   └── server/
│       └── main.go              # HTTP API服务器 (v2.0)
├── pkg/
│   ├── wasmrunner/
│   │   └── runner.go            # Wasm运行时 + 详细错误系统
│   └── ebpf/
│       ├── cpu_limit.c          # eBPF C程序 (支持PGID)
│       ├── manager.go           # Linux eBPF管理器 (v2.0)
│       └── manager_other.go     # 跨平台进程监控
├── examples/
│   └── rust/
│       ├── Cargo.toml
│       └── src/lib.rs           # Rust Wasm示例函数
├── uploads/                      # 上传文件目录
├── go.mod
├── Makefile
├── build.ps1                    # Windows构建脚本
└── test.py                      # Python测试脚本
```

## API接口文档

### 1. 上传Wasm函数

**请求:**
```bash
POST /upload
Content-Type: multipart/form-data
Body: wasm=<WASM文件>
```

**成功响应 (201):**
```json
{
  "id": "1234567890",
  "url": "/execute/1234567890",
  "status": "success"
}
```

### 2. 执行函数

**请求:**
```bash
POST /execute/{id}
Content-Type: application/json

{
  "function": "calculate",  // 可选，默认"calculate"
  "input": 10               // 函数输入
}
```

**成功响应 (200):**
```json
{
  "result": 55,
  "success": true,
  "time_ms": 2,
  "fuel_used": 1234
}
```

**超时响应 (408):**
```json
{
  "error": "execution exceeded time limit",
  "error_type": "timeout",
  "success": false,
  "time_ms": 100,
  "fuel_used": 98765
}
```

**函数不存在响应 (404):**
```json
{
  "error": "function not found in module",
  "error_type": "function_not_found",
  "success": false,
  "time_ms": 1
}
```

### 3. 列出所有函数

**请求:**
```bash
GET /functions
```

**响应:**
```json
{
  "count": 2,
  "functions": [
    {
      "id": "1234567890",
      "url": "/execute/1234567890",
      "size_bytes": "1536",
      "created_at": "2024-01-01T12:00:00Z"
    }
  ]
}
```

### 4. 健康检查

**请求:**
```bash
GET /health
```

**响应:**
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "timestamp": 1704067200
}
```

## 构建与运行

### 前置要求
- Go 1.21+
- Rust 1.70+ (编译Wasm示例)
- Clang/LLVM 15+ (编译eBPF，仅Linux)
- Linux Kernel 5.8+ (eBPF支持)

### Linux

```bash
# 安装依赖
go mod tidy

# 编译eBPF (需要root权限和clang)
cd pkg/ebpf
go generate

# 编译Rust Wasm示例
cd ../../examples/rust
rustup target add wasm32-unknown-unknown
cargo build --release --target wasm32-unknown-unknown

# 运行服务器
cd ../..
go run cmd/server/main.go
```

### Windows

```powershell
# 安装依赖
go mod tidy

# 编译Rust Wasm示例
cd examples/rust
rustup target add wasm32-unknown-unknown
cargo build --release --target wasm32-unknown-unknown

# 运行服务器
cd ../..
go run cmd/server/main.go
```

### 使用Makefile (Linux/macOS)

```bash
make deps          # 安装依赖
make wasm          # 编译Rust Wasm
make run           # 运行服务器
make test          # 运行测试
```

### 使用PowerShell脚本 (Windows)

```powershell
.\build.ps1 deps   # 安装依赖
.\build.ps1 wasm   # 编译Rust Wasm
.\build.ps1 run    # 运行服务器
```

## 使用测试脚本

```bash
# 确保服务器运行中
python test.py
```

测试脚本会自动执行:
1. 健康检查
2. 上传Wasm文件
3. 斐波那契计算测试
4. 阶乘计算测试
5. 平方计算测试
6. 无限循环超时测试

## 可用的Wasm测试函数

[`examples/rust/src/lib.rs`](file:///e:/soloD/d98/examples/rust/src/lib.rs)包含以下测试函数:

| 函数 | 说明 |
|-----|------|
| `calculate(n)` | 斐波那契数列第n项 (默认函数) |
| `fibonacci(n)` | 同上 |
| `factorial(n)` | 阶乘n! |
| `square(n)` | 平方n² |
| `infinite_loop(n)` | 无限循环（测试CPU超时） |
| `slow_calculation(n)` | O(n²)慢速计算 |
| `memory_hog(n)` | 大内存分配（测试5MB配额） |

## eBPF监控机制

### Linux内核级监控

eBPF程序挂载到以下tracepoint:
- `sched:sched_switch` - 进程切换时统计CPU时间
- `sched:sched_process_exit` - 进程退出时清理资源
- `sched:sched_process_fork` - 子进程创建时开始监控
- `syscalls:sys_enter_mmap` - 监控内存分配
- `syscalls:sys_enter_munmap` - 监控内存释放
- `syscalls:sys_enter_brk` - 监控堆内存分配
- `syscalls:sys_enter_mremap` - 监控内存重新分配

### 双重内存监控机制

1. **Wasmtime级**: 在WebAssembly沙箱内限制内存使用（5MB）
2. **eBPF级**: 内核监控进程实际系统调用，防止绕过Wasm限制

### 进程组(PGID)支持

- 自动监控整个进程组
- 子进程也会被自动纳入监控
- 超时后终止整个进程组

### 跨平台降级

- **Linux**: 使用eBPF内核级监控
- **Windows/macOS**: 使用用户态时间轮询监控

## 性能指标

- **正常函数执行**: < 5ms
- **超时检测精度**: ~10ms
- **内存使用**: ~50MB/server
- **并发支持**: 受系统资源限制

## 安全最佳实践

1. **永远不要信任Wasm代码** - 所有执行都在沙箱内
2. **设置合理的资源限制** - 100ms超时，10MB内存
3. **启用eBPF监控** (Linux) - 额外的安全保障
4. **定期更新依赖** - Wasmtime和eBPF库有安全更新
5. **监控执行日志** - 记录所有函数调用和错误

## 故障排除

### eBPF加载失败
```
错误: failed to load BPF objects
解决: 需要Linux Kernel 5.8+，安装clang，运行go generate pkg/ebpf
```

### Wasm执行总是超时
```
检查: 
1. 函数是否有无限循环
2. 输入参数是否过大
3. Wasm模块是否正确编译
```

### 函数调用返回错误
```
查看error_type字段:
- function_not_found: 检查函数名是否正确
- trap: 代码有非法操作（除零、越界等）
- memory_limit: 内存使用超限
```

## 许可证

MIT License

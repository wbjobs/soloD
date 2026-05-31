# Security Monitor - eBPF System Call Tracer

一个基于eBPF技术的轻量级Linux系统调用监控工具，使用Rust编写后端，SvelteKit构建前端。

## 功能特性

- **实时系统调用监控**: 使用eBPF tracepoint捕获 `openat`, `execve`, `connect` 系统调用
- **进程过滤**: 支持监控指定PID的进程或所有进程
- **实时数据推送**: 通过WebSocket将事件实时推送到前端
- **美观的Web界面**: 深色主题，实时展示系统调用信息
- **事件过滤**: 按系统调用类型过滤显示
- **统计数据**: 实时显示各类系统调用的计数

## 架构

```
┌─────────────────────────────────────────────────────────┐
│                     Web Browser                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │              SvelteKit Frontend                 │   │
│  │  - Real-time event display                      │   │
│  │  - Statistics dashboard                         │   │
│  │  - Filtering capabilities                       │   │
│  └───────────────────┬─────────────────────────────┘   │
└───────────────────────┼─────────────────────────────────┘
                        │ WebSocket (ws://localhost:3030/ws)
                        ▼
┌─────────────────────────────────────────────────────────┐
│                Rust User Space (axum)                   │
│  ┌───────────────────────────────────────────────────┐  │
│  │  - WebSocket server                                │  │
│  │  - eBPF event reader                               │  │
│  │  - Event broadcasting                               │  │
│  └─────────────────────┬─────────────────────────────┘  │
└─────────────────────────┼────────────────────────────────┘
                          │ PerfEventArray
                          ▼
┌─────────────────────────────────────────────────────────┐
│                Linux Kernel (eBPF)                      │
│  ┌───────────────────────────────────────────────────┐  │
│  │  - sys_enter_openat tracepoint                    │  │
│  │  - sys_enter_execve tracepoint                    │  │
│  │  - sys_enter_connect tracepoint                   │  │
│  │  - PID filtering map                              │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## 系统要求

- **Linux Kernel >= 5.8** (支持eBPF tracepoints)
- **Rust >= 1.70**
- **Node.js >= 18**
- **Clang/LLVM** (用于编译eBPF程序)
- **根权限** (加载eBPF程序需要)

## 安装依赖

### Ubuntu/Debian

```bash
# 安装系统依赖
sudo apt-get update
sudo apt-get install -y build-essential clang llvm libelf-dev linux-headers-$(uname -r) pkg-config

# 安装Rust (如果尚未安装)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 安装Node.js (推荐使用nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
```

### 使用Makefile安装项目依赖

```bash
make install-deps
```

## 构建项目

### 方式一：使用Makefile

```bash
# 构建所有组件
make build

# 或分别构建
make build-ebpf    # 仅构建eBPF程序
make build-user    # 仅构建用户空间后端
make build-web     # 仅构建前端
```

### 方式二：使用构建脚本

```bash
chmod +x build.sh
./build.sh
```

### 方式三：手动构建

```bash
# 构建eBPF程序
cd ebpf
cargo build --release
cd ..

# 构建用户空间后端
cd user
cargo build --release
cd ..

# 构建前端
cd web
npm install
npm run build
cd ..
```

## 运行项目

### 启动后端

**注意**: 加载eBPF程序需要root权限

```bash
# 监控所有进程
sudo ./target/release/secmon

# 监控特定PID的进程
sudo ./target/release/secmon --pid 1234 --pid 5678

# 指定端口（默认3030）
sudo ./target/release/secmon --port 8080
```

### 启动前端开发服务器

```bash
cd web
npm run dev
```

前端将在 `http://localhost:5173` 启动。

### 使用Makefile同时运行

```bash
# 终端1 - 启动后端
make run-backend

# 终端2 - 启动前端
make run-frontend
```

## 项目结构

```
.
├── ebpf/                    # eBPF内核空间代码
│   ├── src/
│   │   └── lib.rs          # eBPF tracepoint实现
│   └── Cargo.toml
├── user/                    # 用户空间后端代码
│   ├── src/
│   │   ├── lib.rs          # 共享数据结构
│   │   └── main.rs         # 主程序 - WebSocket服务器 + eBPF加载器
│   ├── build.rs            # 构建脚本 - 编译eBPF程序
│   └── Cargo.toml
├── web/                     # SvelteKit前端
│   ├── src/
│   │   ├── app.css         # 全局样式
│   │   ├── app.html        # HTML模板
│   │   └── routes/
│   │       ├── +layout.svelte
│   │       └── +page.svelte # 主页面 - 系统调用展示
│   ├── svelte.config.js
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
├── Cargo.toml               # 工作区配置
├── Makefile                 # Make构建脚本
├── build.sh                 # Shell构建脚本
└── README.md
```

## 监控的系统调用

| 系统调用 | 说明 | 捕获的参数 |
|---------|------|-----------|
| `openat` | 打开文件 | dfd, filename (UTF-8), flags, mode |
| `execve` | 执行程序 | filename (UTF-8) |
| `connect` | 建立网络连接 | fd, addrlen, addr_hex |

## 风险评分规则

系统内置多种安全检测规则，自动评估每个系统调用的风险等级：

| 风险级别 | 颜色 | 分数范围 | 说明 |
|---------|-----|---------|------|
| **严重 (Critical)** | 🔴 红色 | 90-100 | 危险操作，如修改/etc/passwd、执行sudo等 |
| **高危 (High)** | 🟠 橙色 | 70-89 | 可疑操作，如执行临时文件、网络连接等 |
| **中危 (Medium)** | 🟡 黄色 | 50-69 | 需要关注，如修改系统配置、SSH相关操作 |
| **低危 (Low)** | 🟢 绿色 | 10-49 | 正常操作 |

### 内置安全检测规则

| 规则名称 | 触发条件 | 风险级别 |
|---------|---------|---------|
| `ETC_PASSWD_WRITE` | 访问 `/etc/passwd` 或 `/etc/shadow` | Critical |
| `SHELL_EXEC` | 执行 bash/sh/zsh/sudo | Critical |
| `NETWORK_OUTBOUND` | 发起网络连接 | High |
| `PRIVILEGE_ESCALATION` | 权限提升尝试 | Critical |
| `TEMP_EXECUTE` | 执行 /tmp/ 或 /var/tmp/ 中的文件 | High |
| `ETC_MODIFICATION` | 修改 /etc/ 下的配置文件 | Medium |
| `SSH_ACCESS` | SSH相关文件访问 | Medium |
| `HOME_ACCESS` | 访问用户主目录 | Low |

## 前端界面功能

1. **连接状态指示**: 显示WebSocket连接状态
2. **统计面板**: 实时显示各类系统调用和各风险级别的事件数量
3. **过滤按钮**: 
   - 按系统调用类型过滤
   - 按风险级别过滤（严重/高危/中危）
4. **事件列表**: 显示所有捕获的系统调用，包括：
   - 时间戳
   - 进程ID (PID)
   - 进程名称
   - 系统调用类型（彩色标签）
   - **风险评分徽章**（含图标、级别、分数）
   - 调用参数（UTF-8编码的文件名）
5. **风险高亮**: 
   - 严重风险事件红色背景高亮
   - 高危风险事件橙色背景高亮
   - 中危风险事件黄色背景高亮
   - 鼠标悬停显示风险原因详情

## 故障排除

### 权限错误（Permission denied）

**错误信息**: "This program requires root privileges to load eBPF programs."

**解决方案**:

1. **使用sudo运行**（推荐）:
   ```bash
   sudo ./target/release/secmon
   ```

2. **设置文件能力**:
   ```bash
   sudo setcap cap_sys_admin,cap_bpf,cap_perfmon=ep ./target/release/secmon
   ./target/release/secmon
   ```

3. **以root用户登录**:
   ```bash
   sudo su
   ./target/release/secmon
   ```

### eBPF程序加载失败

**错误信息**: "Failed to load eBPF program"

**解决方案**:

1. 确保内核版本 >= 5.8:
   ```bash
   uname -r
   ```
2. 确保已安装内核头文件：
   ```bash
   sudo apt-get install linux-headers-$(uname -r)
   ```
3. 确保eBPF程序已编译:
   ```bash
   make build-ebpf
   ls -la target/release/secmon-ebpf.o
   ```

### WebSocket连接被拒绝

**错误信息**: "WebSocket connection failed" 或控制台显示连接错误

**解决方案**:

1. **确认后端正在运行**:
   - 检查后端是否显示 "WebSocket server listening on ws://0.0.0.0:3030"
   - 检查后端是否显示 "Accepting connections from any origin (CORS enabled)"

2. **检查后端健康状态**:
   ```bash
   curl http://localhost:3030/health
   ```
   应该返回200 OK

3. **检查防火墙设置**:
   ```bash
   # Ubuntu/Debian
   sudo ufw allow 3030/tcp
   ```

4. **CORS已自动配置**:
   - 后端已配置允许任何来源的跨域请求
   - 支持跨域WebSocket连接

### 前端显示乱码或无效字符

**现象**: 文件名显示为乱码或奇怪字符

**解决方案**:

1. 代码已自动处理UTF-8编码问题
2. 无效的UTF-8字节序列会自动替换为 � 字符
3. 这是正常现象，表示捕获的二进制数据不是有效字符串

### 没有事件显示

1. 确认后端正在运行并显示 "Attached tracepoint" 日志
2. 尝试执行一些会触发系统调用的操作:
   ```bash
   # 触发openat
   cat /etc/passwd

   # 触发execve
   bash -c "echo test"

   # 触发connect
   curl https://example.com
   ```
3. 检查后端日志是否有错误
4. 打开浏览器控制台查看WebSocket连接状态

## 开发

### 添加新的系统调用监控

1. 在 `ebpf/src/lib.rs` 中添加新的tracepoint
2. 在 `user/src/lib.rs` 中更新数据结构
3. 在 `user/src/main.rs` 中添加挂载逻辑
4. 在前端 `web/src/routes/+page.svelte` 中添加显示逻辑

## 许可证

MIT License

## 贡献

欢迎提交Issue和Pull Request！

## 致谢

- [Aya Project](https://aya-rs.dev/) - 优秀的Rust eBPF库
- [SvelteKit](https://kit.svelte.dev/) - 前端框架
- [Tokio](https://tokio.rs/) - Rust异步运行时

# Docker Log Monitor - Docker容器日志监控工具

一个功能强大的Go语言命令行工具，用于监控Docker容器日志，支持日志过滤、Webhook告警推送以及Web Dashboard实时展示。

## 功能特性

- 🐳 **Docker日志监控** - 实时监听Docker容器的标准输出和错误输出
- 🔍 **智能日志过滤** - 基于关键字的日志匹配和过滤引擎
- 🔔 **Webhook告警** - 支持钉钉和Slack告警推送
- 📊 **Web Dashboard** - 基于Gin框架和WebSocket的实时日志流展示面板
- ⚙️ **YAML配置** - 灵活的配置文件支持
- 📋 **容器列表** - 快速查看所有Docker容器
- 🚀 **高并发优化** - 针对高并发场景的内存和连接优化

## v1.2.0 新功能发布 - 日志上下文回溯

### 📋 日志上下文回溯功能
- **核心功能**: 当触发告警时，自动抓取告警时间点前后30秒（可配置）的所有日志
- **应用场景**:
  - 错误排查：查看错误发生前后的完整上下文
  - 根因分析：理解错误发生的完整执行路径
  - 问题复现：获取重现问题所需的完整日志信息

### 📦 日志打包下载
- **格式**: 结构化TXT文本格式
- **内容包含**:
  - 告警元数据（ID、触发时间、匹配关键字、容器信息等）
  - 上下文范围说明
  - 完整的上下文日志列表
  - 触发告警的日志高亮标记
- **使用方式**: 在告警历史面板点击"📥 下载"按钮

### 🎨 告警历史面板
- 左侧边栏新增告警历史展示区
- 实时显示告警触发时间、匹配关键字和日志预览
- 每个告警提供"👁 查看"和"📥 下载"两个操作按钮
- 最多保存100条历史告警记录

### 🔍 上下文详情模态框
- 点击告警查看按钮弹出详情窗口
- 展示完整的告警元数据
- 按时间顺序展示上下文范围内的所有日志
- 触发告警的日志条目标红高亮显示
- 支持直接从详情窗口下载完整日志包

### ⚙️ 可配置参数
```yaml
dashboard:
  # 日志上下文回溯时间窗口（秒）
  context_window_seconds: 30
  # 最大缓存日志条数
  max_logs: 500
  # 告警历史最大记录数
  max_alert_history: 100
```

### 🔌 API接口说明
- `GET /api/alerts` - 获取所有告警历史
- `GET /api/alerts/{id}` - 获取指定告警的上下文详情
- `GET /api/alerts/{id}/download` - 下载告警上下文日志包

## v1.1.0 主要修复

### 🔧 内存泄漏修复
- **问题**: 高并发日志输出场景下工具因内存泄漏崩溃
- **修复内容**:
  - 优化了日志缓存机制，使用固定大小的环形缓冲区
  - 添加了goroutine生命周期管理，确保正常退出
  - 优化了channel缓冲大小，防止内存溢出
  - 添加了背压机制，避免日志堆积

### 🔌 WebSocket连接稳定性
- **问题**: Web Dashboard日志无法实时刷新，SSE连接频繁断开
- **修复内容**:
  - 将SSE技术替换为WebSocket协议
  - 添加了服务端Ping/Pong心跳机制（默认60秒）
  - 实现了客户端自动重连和指数退避算法
  - 添加了连接状态可视化指示

### 📈 性能优化
- 日志channel缓冲从100增加到2048
- WebSocket消息缓冲区优化（256KB）
- 告警通知使用Worker Pool模式，4个并发处理
- 前端日志条目限制为1000条，避免浏览器内存压力
- 服务端日志缓存限制为500条，防止内存无限增长

### 🧹 资源清理增强
- 优雅退出机制，等待所有goroutine完成（5秒超时）
- WebSocket连接正确关闭，避免资源泄漏
- 所有channel正确关闭，防止goroutine泄漏
- 添加了doneChan机制，确保日志读取协程正确退出

## 项目结构

```
docker-log-monitor/
├── main.go                 # CLI入口文件
├── config/
│   └── config.go          # 配置文件解析模块
├── docker/
│   └── monitor.go         # Docker日志监听模块
├── filter/
│   └── filter.go          # 日志过滤规则引擎
├── webhook/
│   └── webhook.go         # DingTalk/Slack Webhook推送
├── dashboard/
│   └── dashboard.go       # Gin Web Dashboard + WebSocket
├── templates/
│   └── index.html         # Dashboard前端页面（含告警回溯UI）
├── config.yaml            # 完整配置文件
├── go.mod                 # Go模块依赖
└── README.md              # 项目文档
```

## 安装依赖

```bash
go mod download
```

## 编译

```bash
go build -o docker-log-monitor.exe
```

## 使用说明

### 1. 查看容器列表

```bash
./docker-log-monitor list
```

### 2. 启动日志监控

```bash
# 使用默认配置文件 (config.yaml)
./docker-log-monitor

# 指定配置文件路径
./docker-log-monitor -c /path/to/config.yaml

# 直接指定容器ID/名称
./docker-log-monitor -C container_id_or_name
```

### 3. 查看版本

```bash
./docker-log-monitor version
```

## 配置说明

编辑 `config.yaml` 文件进行配置：

```yaml
docker:
  container_id: "your_container_id"
  follow: true
  tail: "100"
  show_stdout: true
  show_stderr: true

filters:
  keywords:
    - "ERROR"
    - "error"
    - "Exception"

webhook:
  enabled: true
  dingtalk:
    webhook_url: "your_dingtalk_webhook_url"
    secret: "your_dingtalk_secret"
  slack:
    webhook_url: "your_slack_webhook_url"
    channel: "#alerts"

dashboard:
  enabled: true
  host: "localhost"
  port: 8080
```

## Web Dashboard

启动监控后，访问 `http://localhost:8080` 查看实时日志流：

- 📊 实时日志统计（总数、Stdout、Stderr）
- 🔍 客户端日志过滤
- 🎨 深色主题，支持语法高亮
- 📡 Server-Sent Events 实时推送
- ⚡ 连接状态监控

## Webhook告警

当日志中匹配到配置的关键字时，系统会自动发送告警：

### 钉钉配置
1. 在钉钉群中添加自定义机器人
2. 获取Webhook地址和加签密钥
3. 填入配置文件的dingtalk部分

### Slack配置
1. 创建Slack Incoming Webhook
2. 获取Webhook地址
3. 填入配置文件的slack部分

## 技术栈

- **Go 1.21+** - 编程语言
- **Docker API** - 容器日志获取
- **Cobra** - CLI命令行框架
- **Gin** - Web框架
- **YAML** - 配置文件
- **Server-Sent Events** - 实时日志推送

## 核心模块说明

### config - 配置模块
- 支持YAML格式配置文件加载
- 提供默认值设置
- 结构清晰的配置结构体

### docker - Docker监控模块
- 使用官方Docker SDK
- 支持实时日志流获取
- 区分Stdout和Stderr流
- 提供容器列表查询功能

### filter - 过滤引擎
- 线程安全的关键字匹配
- 支持动态添加/删除关键字
- 匹配结果返回命中的关键字列表

### webhook - 告警模块
- 钉钉机器人支持（带签名验证）
- Slack Webhook支持
- 异步发送，不阻塞主流程

### dashboard - Web面板
- 基于Gin的HTTP服务
- SSE实时日志推送
- 现代化的前端界面
- 日志缓存与统计

## 常见问题

### 1. 连接Docker失败
确保Docker daemon正在运行，并且当前用户有访问Docker的权限。

### 2. Dashboard无法访问
检查防火墙设置和端口占用情况，确保8080端口（或配置的其他端口）可用。

### 3. Webhook发送失败
检查网络连接和Webhook地址配置，确保钉钉/Slack机器人设置正确。

## 许可证

MIT License

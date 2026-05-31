# 简易日志处理管道

一个跨语言的分布式日志处理系统，包含日志生成、收集、存储、消费分析和告警功能。

## 系统架构

```
Python 日志生成器 --(UDP)--> Rust 日志收集器 --(批量)--> Kafka --> Go 日志消费者 --(告警)--> Webhook 服务器
```

## 组件说明

### 1. log_generator.py (Python)
- 模拟5个微服务随机生成JSON格式日志
- 通过UDP协议发送到收集器
- 包含日志级别(DEBUG/INFO/WARN/ERROR)、服务名、消息、追踪ID等字段

### 2. collector (Rust + Tokio)
- 高性能异步UDP服务器
- JSON有效性验证，过滤无效数据
- 批量收集日志（每100条或1秒批量发送）
- 将日志写入Kafka主题
- 接收统计和错误计数

### 3. consumer (Go)
- Kafka消费者，从主题读取日志
- 手动提交Offset，确保消息处理成功后才提交
- 实时统计不同日志级别和服务的日志数量
- 每分钟打印统计结果到控制台
- **告警功能**: 当一分钟内ERROR日志超过100条时触发Webhook告警

### 4. webhook_server.py (Python Flask)
- 模拟告警接收Webhook服务器
- 监听 http://localhost:8080/webhook/alerts
- 收到告警后在控制台格式化展示告警信息

## 前置要求

- Docker & Docker Compose
- Python 3.7+
- Rust 1.60+
- Go 1.21+

## 快速开始

### 1. 安装Python依赖

```bash
pip install -r requirements.txt
```

### 2. 启动Kafka环境

```bash
docker-compose up -d
```

### 3. 编译Rust收集器

```bash
cd collector
cargo build --release
cd ..
```

### 4. 编译Go消费者

```bash
cd consumer
go mod init log-consumer  # 首次运行需要
go mod tidy
go build
cd ..
```

### 5. 启动各组件（按顺序，每个组件一个终端）

**终端1 - 启动Webhook告警服务器:**
```bash
python webhook_server.py
```

**终端2 - 启动Rust收集器:**
```bash
cd collector
cargo run --release
```

**终端3 - 启动Go消费者:**
```bash
cd consumer
go run main.go
```

**终端4 - 启动Python日志生成器:**
```bash
python log_generator.py
```

## 使用说明

### Kafka主题

系统使用名为 `logs` 的Kafka主题存储所有日志。

### 日志格式

每条日志为JSON格式：
```json
{
  "id": "uuid",
  "timestamp": "ISO8601",
  "service": "user-service",
  "level": "INFO",
  "message": "日志消息内容",
  "trace_id": "abc123",
  "duration_ms": 123
}
```

### 告警功能配置

告警阈值可在 `consumer/main.go` 中配置：
```go
const (
    errorThreshold   = 100   // 一分钟内ERROR日志阈值
    alertWindow      = 60 * time.Second  // 告警时间窗口
    webhookURL       = "http://localhost:8080/webhook/alerts"  // Webhook地址
)
```

### 告警Payload格式

发送到Webhook的告警数据格式：
```json
{
  "type": "ERROR_THRESHOLD_EXCEEDED",
  "error_count": 156,
  "threshold": 100,
  "time_window": "1 minute",
  "top_services": ["payment-service(45)", "user-service(38)", ...],
  "message": "ERROR logs exceeded threshold: 156/100 in the last minute",
  "timestamp": "2024-01-01T12:00:00Z"
}
```

### 统计输出

Go消费者每分钟输出统计信息：
```
========================================
Log Statistics - 2024-01-01 12:00:00
========================================
Total logs processed: 1234

Log levels:
  DEBUG : 234
  INFO  : 567
  WARN  : 200
  ERROR : 233

Services:
  user-service        : 300
  order-service       : 280
  ...
========================================
```

### 告警输出

当触发告警时，Webhook服务器输出：
```
============================================================
🚨 ALERT RECEIVED - 2024-01-01 12:00:00
============================================================
Alert Type: ERROR_THRESHOLD_EXCEEDED
Error Count: 156
Threshold: 100
Time Window: 1 minute
Top Services: [payment-service(45) user-service(38) ...]
Message: ERROR logs exceeded threshold: 156/100 in the last minute
============================================================
```

## 停止服务

```bash
# 停止Python脚本和编译的程序
Ctrl+C  (每个终端)

# 停止Kafka
docker-compose down
```

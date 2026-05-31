# 分布式任务调度系统

基于 Go + gRPC + Redis + MySQL 开发的分布式任务调度系统核心 API 服务。

## 功能特性

1. **定时任务 CRUD 接口** - 支持 cron 表达式配置
2. **分布式锁** - 基于 Redis，防止多实例重复执行
3. **任务执行日志** - 持久化存储和查询接口
4. **任务控制** - 手动触发、暂停、恢复接口
5. **回调通知** - 任务执行状态的回调通知机制

## 技术栈

- **Go** 1.21+
- **gRPC** - RPC 框架
- **Redis** - 分布式锁
- **MySQL** - 数据持久化
- **GORM** - ORM 框架
- **cron** - cron 表达式解析

## 项目结构

```
d2/
├── proto/              # protobuf 定义
├── cmd/
│   └── server/        # 服务入口
├── internal/
│   ├── model/      # 数据模型
│   ├── repository/ # 数据访问层
│   ├── service/    # 业务逻辑层
│   ├── scheduler/  # 调度器
│   ├── lock/       # 分布式锁
│   └── callback/   # 回调通知
└── configs/         # 配置
```

## 快速开始

### 1. 环境依赖

- MySQL 5.7+ 或 MySQL 8.0+
- Redis 5.0+

### 2. 创建数据库

```sql
CREATE DATABASE task_scheduler CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 3. 配置修改

编辑 `configs/config.go` 修改数据库连接配置：

```go
MySQL: MySQLConfig{
    Host:     "localhost",
    Port:     3306,
    User:     "root",
    Password: "your_password",
    DBName:   "task_scheduler",
},
Redis: RedisConfig{
    Addr:     "localhost:6379",
    Password: "",
    DB:       0,
},
```

### 4. 安装依赖

```bash
go mod download
```

### 5. 启动服务

```bash
go run cmd/server/main.go
```

服务启动后会：
- HTTP API 端口: 8080
- 健康检查: http://localhost:8080/health

## API 接口文档

### 任务管理

#### 创建任务

```bash
POST /api/tasks
Content-Type: application/json

{
    "name": "测试任务",
    "description": "每30秒执行一次",
    "cron_expression": "*/30 * * * * *",
    "callback_url": "http://localhost:9000/callback",
    "timeout_seconds": 60,
    "max_retry": 3
}
```

**Cron 表达式格式（支持秒级）：
```
*    *    *    *    *    *
┬    ┬    ┬    ┬    ┬    ┬
│    │    │    │    │    │
│    │    │    │    │    └─ 星期 (0-6)
│    │    │    │    └────── 月份 (1-12)
│    │    │    └─────────── 日期 (1-31)
│    │    └──────────────── 小时 (0-23)
│    └───────────────────── 分钟 (0-59)
└────────────────────────── 秒 (0-59)
```

#### 获取任务列表

```bash
GET /api/tasks?page=1&page_size=10
```

#### 获取单个任务

```bash
GET /api/tasks/{id}
```

#### 更新任务

```bash
PUT /api/tasks/{id}
Content-Type: application/json

{
    "name": "更新后的任务名",
    "cron_expression": "0 */1 * * * *"
}
```

#### 删除任务

```bash
DELETE /api/tasks/{id}
```

### 任务控制

#### 手动触发任务

```bash
POST /api/tasks/{id}/trigger
```

#### 暂停任务

```bash
POST /api/tasks/{id}/pause
```

#### 恢复任务

```bash
POST /api/tasks/{id}/resume
```

### 执行日志

#### 获取任务执行列表（支持筛选）

```bash
GET /api/tasks/{id}/executions?page=1&page_size=10&status=2
```

**参数说明：**
- `status`: 执行状态 (1=运行中, 2=成功, 3=失败, 4=超时)

#### 获取单个执行详情

```bash
GET /api/executions/{id}
```

#### 获取任务执行统计

```bash
GET /api/tasks/{id}/stats
```

### 监控指标

#### 获取全局指标

```bash
GET /api/metrics
```

**响应示例：**
```json
{
    "success": true,
    "data": {
        "total_tasks": 5,
        "active_tasks": 3,
        "paused_tasks": 1,
        "total_executions": 120,
        "today_executions": 45,
        "today_success": 40,
        "today_failures": 5,
        "success_rate": 88.89
    }
}
```

#### 获取所有任务的指标

```bash
GET /api/metrics/tasks
```

#### 获取单个任务的实时指标

```bash
GET /api/tasks/{id}/metrics
```

## 告警配置

系统支持邮件和 Webhook 两种告警方式，可在 `configs/config.go` 中配置：

### 邮件告警

```go
Email: EmailConfig{
    Enabled:  true,
    Host:     "smtp.example.com",
    Port:     587,
    Username: "user@example.com",
    Password: "password",
    From:     "alerts@example.com",
    To:       []string{"admin@example.com"},
}
```

### Webhook 告警

```go
Webhook: WebhookConfig{
    Enabled: true,
    URL:     "http://example.com/webhook",
    Headers: map[string]string{"X-API-Key": "secret"},
}
```

### 告警级别

- **ERROR**: 任务执行失败
- **CRITICAL**: 任务执行失败且已达最大重试次数

## 任务状态说明

### 任务状态 (Task Status)
- `1` - 启用 (ENABLED)
- `2` - 暂停 (PAUSED)
- `3` - 禁用 (DISABLED)

### 执行状态 (Execution Status)
- `1` - 运行中 (RUNNING)
- `2` - 成功 (SUCCESS)
- `3` - 失败 (FAILED)
- `4` - 超时 (TIMEOUT)

## 核心设计

### 分布式锁

系统使用 Redis 实现分布式锁，确保在多实例部署时任务不会被重复执行。

### 调度器设计

- 使用工作池模式处理任务执行
- 每 5 秒检查一次到期任务
- 支持任务重试机制

### 回调通知

任务执行开始和完成时，系统会向配置的 callback_url 发送 POST 请求：

```json
{
    "execution_id": 1,
    "task_id": 1,
    "status": "SUCCESS",
    "result": "Task 1 executed successfully at ...",
    "error": "",
    "start_time": "2024-01-01T12:00:00Z",
    "end_time": "2024-01-01T12:00:01Z",
    "retry_count": 0
}
```

## 示例请求

### 1. 创建一个每分钟执行的任务

```bash
curl -X POST http://localhost:8080/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "每分钟任务",
    "description": "测试每分钟执行一次",
    "cron_expression": "0 */1 * * * *",
    "callback_url": "http://example.com/webhook",
    "timeout_seconds": 30,
    "max_retry": 2
  }'
```

### 2. 手动触发任务

```bash
curl -X POST http://localhost:8080/api/tasks/1/trigger
```

### 3. 查看执行日志

```bash
curl http://localhost:8080/api/tasks/1/executions
```

## 注意事项

1. 确保 MySQL 和 Redis 服务需正常运行
2. Cron 表达式支持秒级精度
3. 回调 URL 需要能正常接收 POST 请求
4. 生产环境建议修改默认配置参数

## 许可证

MIT License

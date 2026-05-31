# 轻量级分布式任务调度系统

一个支持任务依赖（DAG）的分布式任务调度系统，使用 Java Spring Boot 作为 Scheduler，Python 作为 Worker，通过 RabbitMQ 进行通信。

## 架构

- **Scheduler**: Java Spring Boot 应用，提供 REST API 提交任务，管理任务状态，处理 DAG 依赖
- **Worker**: Python 应用，从 RabbitMQ 领取任务并执行 Shell 命令
- **RabbitMQ**: 消息队列，用于 Scheduler 和 Worker 之间的通信
- **SQLite**: 存储任务定义、状态和历史记录

## 项目结构

```
.
├── scheduler/          # Java Scheduler 服务
│   ├── src/
│   │   └── main/
│   │       ├── java/com/dispatch/scheduler/
│   │       │   ├── SchedulerApplication.java
│   │       │   ├── config/
│   │       │   ├── controller/
│   │       │   ├── dto/
│   │       │   ├── messaging/
│   │       │   ├── model/
│   │       │   ├── repository/
│   │       │   └── service/
│   │       └── resources/
│   └── pom.xml
└── worker/             # Python Worker
    ├── worker.py
    └── requirements.txt
```

## 前置要求

- Java 17+
- Python 3.7+
- Maven 3.6+
- RabbitMQ 3.x (运行在 localhost:5672)

## 快速开始

### 1. 启动 RabbitMQ

使用 Docker 启动 RabbitMQ：
```bash
docker run -d -p 5672:5672 -p 15672:15672 rabbitmq:3-management
```

### 2. 启动 Scheduler

```bash
cd scheduler
mvn clean package
java -jar target/scheduler-1.0.0.jar
```

Scheduler 将在 http://localhost:8080 启动

### 3. 启动 Worker

```bash
cd worker
pip install -r requirements.txt
python worker.py
```

可以启动多个 Worker 实例。

## API 使用

### 提交任务

```bash
# 提交独立任务
curl -X POST http://localhost:8080/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "echo-task",
    "command": "echo Hello World"
  }'

# 提交有依赖的任务（DAG）
# 首先提交任务 A
curl -X POST http://localhost:8080/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "task-A",
    "command": "echo Task A"
  }'

# 记录返回的任务 ID，然后提交依赖任务 A 的任务 B
curl -X POST http://localhost:8080/api/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "task-B",
    "command": "echo Task B",
    "dependencies": ["<task-a-id>"]
  }'
```

### 查询任务

```bash
# 获取所有任务
curl http://localhost:8080/api/tasks

# 获取特定任务
curl http://localhost:8080/api/tasks/<task-id>
```

## 任务状态

- **PENDING**: 任务已提交，等待依赖完成
- **READY**: 所有依赖已完成，可以执行
- **RUNNING**: 任务正在执行
- **COMPLETED**: 任务成功完成
- **FAILED**: 任务执行失败

## 特性

- ✅ DAG 任务依赖支持
- ✅ 分布式 Worker 执行
- ✅ RabbitMQ 消息队列通信
- ✅ SQLite 持久化存储
- ✅ 任务状态跟踪
- ✅ 自动重连机制
- ✅ 任务超时处理

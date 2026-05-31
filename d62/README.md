# 轻量级分布式任务调度系统 - 死锁检测模块

## 功能特性

1. **有向图建模任务依赖关系**：使用有向无环图(DAG)建模任务依赖，支持检测环和拓扑排序
2. **改进的DFS死锁检测算法**：通过构建wait-for等待图，检测任务间的循环等待
3. **智能牺牲者选择**：基于任务优先级、运行时长、资源占用大小自动选择牺牲任务
4. **任务重试机制**：被终止的任务延迟5分钟后重新入队
5. **审计日志**：所有死锁事件和决策记录到数据库，提供查询API
6. **定时检测**：后台每30秒自动运行死锁检测

## 技术栈

- **后端**：Go + Gin Web框架
- **数据库**：PostgreSQL
- **消息队列**：Redis Stream

## 项目结构

```
deadlock-detector/
├── cmd/
│   └── main.go              # 程序入口
├── config/
│   └── config.go            # 配置文件
├── internal/
│   ├── api/
│   │   └── handlers.go      # API处理器
│   ├── database/
│   │   ├── models.go        # 数据模型
│   │   └── db.go            # 数据库操作
│   ├── detector/
│   │   └── detector.go      # 死锁检测算法
│   ├── graph/
│   │   └── graph.go         # 有向图建模
│   ├── redis/
│   │   └── redis.go         # Redis操作
│   └── scheduler/
│       └── scheduler.go     # 定时调度器
├── go.mod
├── go.sum
└── README.md
```

## 快速开始

### 前置要求

- Go 1.19+
- PostgreSQL 13+
- Redis 6+

### 数据库配置

创建PostgreSQL数据库：
```sql
CREATE DATABASE deadlock_detector;
```

### 配置修改

编辑 `config/config.go` 修改连接配置：
```go
const (
    PostgresDSN = "host=localhost user=postgres password=postgres dbname=deadlock_detector port=5432 sslmode=disable"
    RedisAddr   = "localhost:6379"
    // ...
)
```

### 运行服务

```bash
go mod tidy
go run cmd/main.go
```

服务将在 `http://localhost:8080` 启动。

## API接口文档

### 任务管理

#### 创建任务
```
POST /api/v1/tasks
Content-Type: application/json

{
    "name": "任务A",
    "priority": 1,
    "max_retries": 3,
    "worker_id": "worker-1"
}
```

#### 获取运行中任务
```
GET /api/v1/tasks
```

#### 启动任务
```
POST /api/v1/tasks/:id/start
```

#### 完成任务
```
POST /api/v1/tasks/:id/complete
```

### 任务依赖

#### 创建依赖关系
```
POST /api/v1/dependencies
Content-Type: application/json

{
    "task_id": 1,
    "depends_on_id": 2
}
```

### 资源锁

#### 创建资源锁
```
POST /api/v1/locks
Content-Type: application/json

{
    "task_id": 1,
    "resource": "database_connection",
    "is_held": true,
    "wait_task_id": null
}
```

#### 获取所有资源锁
```
GET /api/v1/locks
```

### 死锁检测

#### 手动触发死锁检测
```
POST /api/v1/deadlock/detect
```

#### 获取死锁历史
```
GET /api/v1/deadlock/history?page=1&page_size=20
```

#### 获取单个死锁事件
```
GET /api/v1/deadlock/history/:id
```

#### 获取死锁统计
```
GET /api/v1/deadlock/stats?start_date=2024-01-01T00:00:00Z&end_date=2024-12-31T23:59:59Z
```

### 调度器

#### 获取调度器状态
```
GET /api/v1/scheduler/status
```

## 死锁检测原理

### 1. Wait-For图构建
系统通过资源锁表构建等待图：
- 如果任务A等待任务B持有的资源，则图中存在边 A→B

### 2. 环检测算法
使用改进的DFS算法：
- 对每个未访问节点启动DFS遍历
- 维护递归栈记录当前路径
- 如果发现回到已访问且在递归栈中的节点，则存在环
- 提取环中的所有任务ID

### 3. 牺牲者选择策略
对环中的每个任务计算综合得分：
```
得分 = 优先级 × 100 + 运行时长(秒) × 0.1 + 持有资源数 × 10 + 重试次数 × 50
```
选择得分最低的任务作为牺牲者。

## 核心数据模型

### Task (任务表)
- ID: 任务主键
- Name: 任务名称
- Priority: 优先级(数字越小优先级越低)
- Status: 任务状态 (pending/running/completed/failed/rolled_back)
- WorkerID: 工作节点ID
- RetryCount: 重试次数
- MaxRetries: 最大重试次数
- StartTime: 开始时间
- EndTime: 结束时间

### TaskDependency (任务依赖表)
- TaskID: 任务ID
- DependsOnID: 依赖的任务ID

### ResourceLock (资源锁表)
- TaskID: 持有锁的任务ID
- WaitTaskID: 等待锁的任务ID
- Resource: 资源名称
- IsHeld: 是否已持有锁

### DeadlockEvent (死锁事件表)
- DetectedAt: 检测时间
- CycleLength: 环长度
- TaskIDs: 死锁任务ID列表
- TaskNames: 死锁任务名称列表
- SacrificeID: 牺牲任务ID
- SacrificeName: 牺牲任务名称
- Reason: 牺牲原因

## 测试死锁场景

可以通过以下步骤创建死锁场景进行测试：

1. 创建任务A和任务B
2. 启动两个任务
3. 任务A持有资源X，等待资源Y
4. 任务B持有资源Y，等待资源X
5. 等待30秒或手动触发检测
6. 查看死锁历史记录

## 注意事项

1. 死锁检测间隔默认为30秒，可在配置中修改
2. 任务重试延迟默认为5分钟
3. 任务重试次数有上限，超过后不再自动重试
4. 牺牲者选择算法可根据业务需求调整权重

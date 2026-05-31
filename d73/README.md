# 分布式键值存储系统 - Raft 共识算法

基于 Raft 共识算法实现的分布式键值存储系统，使用 Python 编写。

## ✨ 最新特性：日志快照 (Log Snapshot)

系统现在支持自动日志快照功能，防止日志无限增长：

- **自动快照**: 当日志条目达到 1000 条时自动触发快照
- **持久化存储**: 快照数据持久化到磁盘（pickle 格式）
- **启动恢复**: 节点启动时自动加载最新快照
- **日志压缩**: 创建快照后自动压缩日志，只保留快照后的条目
- **状态 API**: 可通过 HTTP 接口查看快照状态
- **手动触发**: 支持手动强制创建快照

## 系统架构

- **Raft 共识算法**: 领导者选举、日志复制、一致性保证、日志快照
- **HTTP API**: FastAPI 提供 RESTful 接口
- **gRPC**: 节点间通信
- **LevelDB**: 本地数据持久化

## 节点配置

| 节点 | HTTP 端口 | gRPC 端口 |
|------|-----------|-----------|
| node1 | 8001 | 50051 |
| node2 | 8002 | 50052 |
| node3 | 8003 | 50053 |

## 安装依赖

```bash
pip install -r requirements.txt
```

## 快速启动

### 方式一：批量启动所有节点（推荐）

```bash
python start_all.py
```

此命令会：
1. 清理旧数据
2. 生成 gRPC 代码
3. 按顺序启动 3 个节点（每个间隔 3 秒）
4. 等待领导者选举完成

### 方式二：单独启动节点

```bash
# 终端1
python node.py node1

# 终端2
python node.py node2

# 终端3
python node.py node3
```

## 运行测试

确保所有节点已启动后，在新终端运行：

### 基础功能测试

```bash
python test_kv.py
```

### 快照功能测试

```bash
python test_snapshot.py
```

测试内容：
1. 检测所有节点状态和快照情况
2. 向领导者写入测试数据
3. 验证所有节点数据一致性
4. 手动强制创建快照
5. 显示快照创建后的日志压缩效果

## API 接口

### 1. 查询节点状态（包含快照信息）

```bash
GET /status
```

响应示例：
```json
{
  "node_id": "node1",
  "is_leader": true,
  "leader_id": "node1",
  "snapshot": {
    "snapshot_index": 0,
    "snapshot_term": 0,
    "log_count": 1,
    "total_logs": 0,
    "threshold": 1000
  }
}
```

### 2. 写入键值

```bash
POST /put
Content-Type: application/json

{
  "key": "mykey",
  "value": {"name": "test", "data": 123}
}
```

**注意**: 只能向领导者节点写入。

### 3. 读取键值

```bash
GET /get/{key}
```

响应示例：
```json
{
  "key": "mykey",
  "value": {"name": "test", "data": 123}
}
```

### 4. 强制创建快照

```bash
POST /snapshot/force
```

响应示例：
```json
{
  "status": "ok",
  "message": "Snapshot created",
  "stats": {
    "snapshot_index": 50,
    "snapshot_term": 1,
    "log_count": 2,
    "total_logs": 50,
    "threshold": 1000
  }
}
```

## 项目结构

```
.
├── raft/                  # Raft 算法实现
│   ├── __init__.py
│   ├── state.py          # Raft 状态管理（线程安全 + 快照）
│   └── node.py           # Raft 节点逻辑
├── storage/               # 存储层
│   ├── __init__.py
│   └── leveldb_store.py  # LevelDB 封装 + KV 状态机 + 快照序列化
├── rpc/                   # gRPC 层
│   ├── __init__.py
│   ├── server.py         # gRPC 服务端
│   └── client.py         # gRPC 客户端
├── http_server/           # HTTP API 层
│   ├── __init__.py
│   └── api.py            # FastAPI 路由
├── proto/                 # Protocol Buffers
│   ├── __init__.py
│   └── raft.proto        # gRPC 定义
├── data/                  # 数据目录
│   ├── node1/
│   │   ├── db/           # LevelDB 数据
│   │   └── snapshots/    # 快照文件
│   ├── node2/
│   └── node3/
├── config.py              # 配置文件
├── node.py                # 主节点启动类
├── start_all.py           # 批量启动脚本
├── test_kv.py             # 功能测试脚本
├── test_snapshot.py       # 快照功能测试脚本
├── generate_grpc.py       # gRPC 代码生成脚本
├── clean.py               # 清理脚本
└── requirements.txt       # 依赖列表
```

## Raft 算法特性

- ✅ 领导者选举（随机超时避免活锁）
- ✅ 日志复制（异步并发发送）
- ✅ 日志一致性检查
- ✅ 提交索引管理
- ✅ 状态机应用
- ✅ 线程安全的状态访问
- ✅ 日志快照与压缩
- ✅ 快照持久化与恢复

## 使用示例

```bash
# 1. 启动所有节点
python start_all.py

# 2. 等待领导者选举完成（约 5-10 秒）

# 3. 查找领导者节点
curl http://localhost:8001/status
curl http://localhost:8002/status
curl http://localhost:8003/status

# 4. 向领导者写入数据
curl -X POST http://localhost:8001/put \
  -H "Content-Type: application/json" \
  -d '{"key": "user:1", "value": {"name": "Alice", "age": 25}}'

# 5. 从任意节点读取数据
curl http://localhost:8001/get/user:1
curl http://localhost:8002/get/user:1
curl http://localhost:8003/get/user:1

# 6. 强制创建快照（测试用）
curl -X POST http://localhost:8001/snapshot/force
```

## 快照工作原理

### 1. 触发条件
- 默认阈值：1000 条日志
- 每 5 秒检查一次是否需要快照
- 也可通过 `/snapshot/force` 手动触发

### 2. 创建流程
1. 获取当前已应用的最大日志索引
2. 调用状态机的 `create_snapshot()` 序列化数据
3. 将快照数据保存到磁盘（`snapshots/snapshot_{index}.dat`）
4. 更新元数据文件（`snapshots/metadata.json`）
5. 压缩日志，只保留快照索引之后的条目
6. 更新 `snapshot_index` 和 `snapshot_term`

### 3. 恢复流程
1. 节点启动时读取 `metadata.json` 找到最新快照
2. 加载对应快照文件并反序列化
3. 调用状态机的 `restore_snapshot()` 恢复数据
4. 将 `commit_index` 和 `last_applied` 设置为快照索引

### 4. 数据目录结构
```
data/node1/
├── db/                    # LevelDB 数据库
│   ├── CURRENT
│   ├── LOCK
│   ├── LOG
│   └── MANIFEST-000001
└── snapshots/             # 快照目录
    ├── metadata.json      # 快照元数据（最新索引）
    ├── snapshot_50.dat    # 第 50 条日志的快照
    └── snapshot_1050.dat  # 后续快照（自动清理旧快照）
```

## 故障排查

### 1. 无法选举出 Leader

- 检查所有节点的 gRPC 端口是否可用
- 查看节点日志确认是否有网络错误
- 确保防火墙未阻止 50051-50053 端口

### 2. 写入后无法读取

- 确认写入时该节点确实是 Leader
- 等待 1-2 秒让日志完成复制
- 检查节点日志确认提交状态

### 3. 快照不工作

- 确认日志条目数已达到阈值（默认 1000）
- 检查快照目录是否有写入权限
- 查看节点日志确认快照创建状态

### 4. 清理后重新测试

```bash
python clean.py
python start_all.py
```

## 性能调优

如需调整快照相关参数，可修改 `raft/state.py` 中的：

```python
class RaftState:
    SNAPSHOT_THRESHOLD = 1000  # 快照触发阈值
    ...

# 以及 raft/node.py 中的检查间隔：
self._snapshot_check_interval = 5  # 秒
```

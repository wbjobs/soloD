# 实时用户行为分析平台 v2.0

基于 Python + FastAPI + ClickHouse + React + ECharts 开发的实时用户行为分析平台。

## 新功能 v2.0

### 性能优化
- ✅ **ClickHouse 连接池**：复用数据库连接，提高并发性能
- ✅ **异步批量缓冲**：高并发下自动缓冲写入，减少数据库压力
- ✅ **重试机制**：失败自动重试，指数退避，保证数据不丢失
- ✅ **查询缓存**：1秒TTL缓存，减少重复查询

### 实时性提升
- ✅ **WebSocket 实时推送**：每秒推送实时统计数据
- ✅ **自动重连**：断线自动重连，指数退避
- ✅ **心跳机制**：保持连接活跃
- ✅ **连接状态显示**：前端实时显示连接状态

## 项目结构

```
.
├── backend/              # 后端服务
│   ├── main.py          # FastAPI主应用
│   ├── clickhouse_client.py  # ClickHouse客户端（连接池+缓冲+缓存）
│   ├── requirements.txt # Python依赖
│   └── .env            # 环境配置
├── frontend/            # 前端应用
│   ├── src/
│   │   ├── App.js      # 主应用组件
│   │   ├── index.js    # 入口文件
│   │   ├── services/
│   │   │   └── api.js  # API服务（含WebSocket）
│   │   └── pages/      # 页面组件
│   │       ├── Dashboard.js     # 数据看板（实时更新）
│   │       ├── FunnelAnalysis.js # 漏斗分析
│   │       ├── UserPaths.js      # 用户路径
│   │       └── QueryPage.js      # SQL查询
│   ├── package.json    # Node依赖
│   └── public/         # 静态资源
├── clickhouse/         # 数据库脚本
│   └── schema.sql      # 建表语句
├── data_generator.py   # 测试数据生成器
└── README.md
```

## 快速开始

### 1. 启动ClickHouse数据库

```bash
# 使用Docker启动ClickHouse
docker run -d -p 8123:8123 -p 9000:9000 --name clickhouse yandex/clickhouse-server:latest

# 执行建表脚本
cat clickhouse/schema.sql | docker exec -i clickhouse clickhouse-client
```

### 2. 启动后端服务

```bash
cd backend

# 创建虚拟环境
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 启动服务
python main.py
```

后端服务将在 http://localhost:8000 启动

### 3. 启动前端服务

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm start
```

前端服务将在 http://localhost:3000 启动

### 4. 生成测试数据（可选）

```bash
# 在项目根目录运行
python data_generator.py
```

这将以约200 events/sec的速度持续产生测试数据，可以观察实时看板的数据变化。

## API 接口

### WebSocket 接口
```
Endpoint: /ws/realtime
Protocol: WebSocket

消息格式：
{
  "type": "realtime_stats",
  "data": {
    "pv": 1234,
    "uv": 567,
    "sessions": 89
  },
  "timestamp": "2024-01-01T12:00:00.000000"
}
```

### 数据采集接口
```
POST /api/events
Content-Type: application/json

[
  {
    "user_id": "user_123",
    "session_id": "session_456",
    "event_type": "page_view",
    "page_url": "/product",
    ...
  }
]
```

**注意**：数据写入是异步缓冲的，接口立即返回，数据在后台批量写入。

### 统计接口
- `GET /api/stats/realtime` - 实时统计（近1分钟）
- `GET /api/stats/hourly?hours=24` - 小时级趋势
- `GET /api/stats/daily?days=7` - 日级统计
- `GET /api/stats/top-pages?limit=10` - 热门页面
- `GET /api/stats/countries` - 国家分布
- `GET /api/stats/devices` - 设备分布

### 分析接口
- `POST /api/analysis/funnel` - 漏斗分析
- `GET /api/analysis/retention?days=7` - 留存分析
- `GET /api/analysis/user-paths?limit=1000` - 用户路径

### 查询接口
- `POST /api/query` - 执行SQL查询

## 性能特性

### ClickHouse 客户端优化

**连接池**
- 默认5个连接，自动扩容
- 连接健康检查
- 超时自动重连

**异步缓冲写入**
- 批量大小：500条/批
- 刷新间隔：500ms
- 高并发下自动缓冲，峰值可承载数千QPS

**重试机制**
- 最多重试3次
- 指数退避（500ms → 1s → 2s）
- 失败数据保留在缓冲区

**查询缓存**
- TTL：1秒
- 减少重复查询压力
- 高并发下性能显著提升

### WebSocket 优化

**自动重连**
- 最多重试10次
- 指数退避（最高30秒）
- 断线自动恢复

**心跳机制**
- 每30秒发送ping
- 防止NAT超时断开

**连接管理**
- 懒加载连接
- 自动清理监听回调

## 数据模型

### user_events (用户事件表)
存储所有用户行为事件数据，MergeTree引擎。

### user_sessions (会话表)
存储用户会话聚合数据，ReplacingMergeTree引擎。

### user_profiles (用户画像表)
存储用户维度聚合数据，ReplacingMergeTree引擎。

### hourly_stats_mv (小时统计物化视图)
自动聚合小时维度统计数据。

### daily_stats_mv (日统计物化视图)
自动聚合日维度统计数据。

## 技术栈

### 后端
- FastAPI 0.109 - Web框架
- ClickHouse - OLAP数据库
- Python 3.8+
- Websockets 12.0

### 前端
- React 18+
- ECharts - 数据可视化
- Ant Design 5.x - UI组件库
- Axios - HTTP客户端

## 监控与调试

### 健康检查
```bash
curl http://localhost:8000/api/health
```

返回：
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00.000000",
  "version": "2.0.0",
  "websocket_connections": 5
}
```

### 日志
- 后端日志显示缓冲刷新状态
- 前端控制台显示WebSocket连接状态

## 扩展性

### 水平扩展
- ClickHouse支持集群部署
- 后端服务可无状态扩展
- WebSocket连接可通过消息队列广播

### 数据保留
- 可配置TTL策略
- 支持冷热数据分层存储
- 自动分区管理

## 注意事项

1. **生产环境**：建议部署ClickHouse集群，配置副本和分片
2. **认证**：生产环境需添加API认证和WebSocket鉴权
3. **监控**：建议添加ClickHouse性能监控和慢查询日志
4. **数据备份**：定期备份重要数据表

## License

MIT

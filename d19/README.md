# IoT 温度数据处理流程

使用 Node-RED 搭建的物联网温度传感器数据处理流程。

## 功能概述

1. **设备模拟**：每秒生成一个 -10 到 40 摄氏度之间的随机温度值
2. **数据处理**：
   - 摄氏度转换为华氏度
   - 高温告警检测（超过 30°C 触发）
3. **数据输出**：
   - MQTT 发布到 `sensors/temperature` 主题
   - HTTP POST 发送告警到 Express 服务
4. **数据持久化**：将所有温度数据存入 SQLite 数据库
5. **可视化**：Node-RED Dashboard 实时温度曲线

## 前置要求

### Docker 方式（推荐）
- Docker
- Docker Compose

### 本地运行方式
- Node.js (v14+)
- Node-RED (全局安装)
- Mosquitto MQTT 代理（本地运行）
- SQLite

## 快速开始（Docker 方式）

### 1. 启动所有服务

```bash
docker-compose up -d
```

### 2. 查看服务状态

```bash
docker-compose ps
```

### 3. 查看日志

```bash
# 查看所有服务日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f node-red
docker-compose logs -f mosquitto
docker-compose logs -f alarm-server
```

### 4. 停止服务

```bash
docker-compose down
```

## 本地运行方式

### 1. 安装依赖

```bash
npm install
```

### 2. 安装 Node-RED 和相关节点

```bash
npm install -g node-red
npm install -g node-red-dashboard
npm install -g node-red-node-sqlite
```

### 3. 安装 Mosquitto MQTT 代理

**Windows**:
- 下载并安装 Mosquitto: https://mosquitto.org/download/
- 确保服务运行在 localhost:1883

**Mac/Linux**:
```bash
# Ubuntu/Debian
sudo apt-get install mosquitto

# Mac
brew install mosquitto
```

### 4. 运行项目

#### 方式一：分别启动（推荐）

1. **启动告警服务器**
```bash
npm start
```

2. **启动 Node-RED**（新终端）
```bash
node-red
```

#### 方式二：同时启动

```bash
npm run dev
```

## 重要：Node-RED 流配置说明

### Docker 环境（默认配置）
- **MQTT Broker**: `mosquitto:1883` （Docker 服务名）
- **告警服务 URL**: `http://alarm-server:3000/alarm` （Docker 服务名）
- **SQLite 数据库路径**: `/data/temperature.db`

### 本地运行环境
- **MQTT Broker**: `localhost:1883`
- **告警服务 URL**: `http://localhost:3000/alarm`
- **SQLite 数据库路径**: `/data/temperature.db` （根据 Node-RED 配置调整）

**注意**：本地运行时需要手动修改 MQTT broker 和 HTTP request 节点的地址配置。

## 配置 Node-RED 流程

1. 打开浏览器访问 Node-RED: http://localhost:1880

2. 导入流程配置：
   - 点击右上角菜单 → 导入
   - 选择 "选择文件"，选择 `flows.json`
   - 点击"导入"

3. 部署流程：
   - 点击右上角的"部署"按钮

## 访问仪表板

打开浏览器访问: http://localhost:1880/ui

## 数据持久化说明

### 数据库结构

温度数据存储在 `temperature_data` 表中，结构如下：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 自增主键 |
| timestamp | TEXT | ISO 格式时间戳 |
| celsius | REAL | 摄氏度温度 |
| fahrenheit | REAL | 华氏度温度 |

### 自动建表

流程启动时，"准备数据库插入"函数节点会自动执行建表语句：
```sql
CREATE TABLE IF NOT EXISTS temperature_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT,
  celsius REAL,
  fahrenheit REAL
)
```

### 数据插入

每秒生成的温度数据会自动插入数据库，插入语句：
```sql
INSERT INTO temperature_data (timestamp, celsius, fahrenheit) VALUES (?, ?, ?)
```

### 查看数据库数据

**Docker 环境**：
```bash
# 进入 Node-RED 容器
docker exec -it node-red bash

# 使用 sqlite3 查看数据
sqlite3 /data/temperature.db

# 查询所有数据
SELECT * FROM temperature_data;

# 查询最近 10 条数据
SELECT * FROM temperature_data ORDER BY id DESC LIMIT 10;

# 查询平均温度
SELECT AVG(celsius) as avg_celsius FROM temperature_data;
```

**本地环境**：
```bash
sqlite3 /path/to/temperature.db
```

## 流程说明

### 节点说明

| 节点类型 | 名称 | 功能 |
|---------|------|------|
| inject | 每秒触发 | 每 1 秒触发一次流程 |
| function | 生成随机温度 | 生成 -10°C 到 40°C 的随机温度 |
| function | 摄氏度转华氏度 | 温度单位转换 |
| function | 高温告警检测 | 检测温度是否超过 30°C |
| function | 准备图表数据 | 提取温度值供图表使用 |
| function | 准备数据库插入 | 构建 SQL 插入语句 |
| mqtt out | 发布到 MQTT | 发布数据到 sensors/temperature 主题 |
| http request | 发送告警 | 发送 POST 请求到告警服务 |
| sqlite | 写入 SQLite | 将温度数据写入 SQLite 数据库 |
| ui_chart | 温度图表 | 实时显示温度变化曲线 |

### 数据流

```
每秒触发 → 生成温度 → 摄氏度转华氏度 → MQTT 发布
                                        → 准备数据库插入 → 写入 SQLite
                    → 高温告警检测 → HTTP 告警
                    → 准备图表数据 → Dashboard 图表
```

### MQTT 消息格式

```json
{
  "celsius": 25.5,
  "timestamp": "2024-01-01T12:00:00.000Z",
  "fahrenheit": 77.9
}
```

### 告警消息格式

```json
{
  "alarm": "高温告警",
  "temperature": 32.5,
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

## 测试验证

### 1. 查看 MQTT 消息

使用 MQTT 客户端（如 MQTT.fx 或 mosquitto_sub）订阅主题：

```bash
mosquitto_sub -h localhost -t sensors/temperature -v
```

### 2. 查看告警输出

在告警服务器终端可以看到高温告警的日志输出。

### 3. 查看仪表板

访问 http://localhost:1880/ui 查看实时温度曲线。

### 4. 查看数据库数据

参考上面的"查看数据库数据"部分，使用 sqlite3 命令行工具查询。

## 自定义配置

- 修改温度范围：编辑"生成随机温度"函数节点
- 修改告警阈值：编辑"高温告警检测"函数节点中的 `threshold` 变量
- 修改 MQTT 配置：编辑 MQTT broker 节点配置
- 修改告警服务 URL：编辑"发送告警" HTTP request 节点
- 修改数据库路径：编辑 SQLite 配置节点中的数据库路径
- 修改表结构：编辑"准备数据库插入"函数节点中的建表和插入语句

## 项目结构

```
.
├── docker-compose.yml          # Docker Compose 配置
├── Dockerfile                  # 告警服务 Docker 镜像配置
├── .dockerignore               # Docker 构建忽略文件
├── alarm-server.js             # Express 告警接收服务
├── flows.json                  # Node-RED 流程配置
├── package.json                # 项目依赖配置
├── mosquitto/
│   └── config/
│       └── mosquitto.conf      # Mosquitto MQTT 配置
├── node-red/
│   └── Dockerfile              # Node-RED 自定义镜像（预装 Dashboard、SQLite）
├── node-red-data/              # Node-RED 数据目录（自动创建，包含 SQLite 数据库）
└── README.md                   # 项目说明文档
```

## 故障排除

### MQTT 连接失败
- **Docker 环境**：确保 `mosquitto` 服务正在运行，检查 Node-RED 中 MQTT broker 地址是否为 `mosquitto`
- **本地环境**：确保 Mosquitto 服务正在运行，检查地址是否为 `localhost`
- 检查端口 1883 是否被占用

### Node-RED Dashboard 不显示
- **Docker 环境**：Docker 镜像已预装 node-red-dashboard 插件，重启容器即可
- **本地环境**：确保已安装 node-red-dashboard 插件，重启 Node-RED 服务

### 告警不发送
- **Docker 环境**：确保告警服务地址为 `http://alarm-server:3000/alarm`
- **本地环境**：确保告警服务地址为 `http://localhost:3000/alarm`
- 检查 HTTP request 节点配置

### 数据库写入失败
- 确保 Node-RED 容器对 `/data` 目录有写入权限
- 检查 SQLite 节点配置是否正确
- 查看 Node-RED 日志确认是否有错误信息

### Docker 服务无法启动
```bash
# 查看详细错误日志
docker-compose logs --tail=50

# 重建并启动
docker-compose up -d --build
```

## 温度转换公式验证

**摄氏度转华氏度公式**：`F = C × 9/5 + 32`

示例验证：
- 0°C → 32°F ✓
- 100°C → 212°F ✓
- -10°C → 14°F ✓
- 30°C → 86°F ✓

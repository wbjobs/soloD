# 实时配送追踪微服务系统

基于gRPC的微服务架构，包含订单管理、路径计算和实时位置通知服务。

## 系统架构

```
┌─────────────────┐     gRPC      ┌─────────────────┐
│  订单服务        │ ◄───────────► │                 │
│  (50051)         │               │   React 前端     │
└─────────────────┘               │   (localhost:3000)│
                                  │                 │
┌─────────────────┐     gRPC      │                 │
│  地图服务        │ ◄───────────► │                 │
│  (50052)         │               └────────┬────────┘
└─────────────────┘                        │
                                           │ WebSocket
┌─────────────────┐                        ▼
│  通知服务        │ ◄───────────────────────────┘
│  gRPC: 50053     │
│  WebSocket: 8080 │
└─────────────────┘
```

## 服务说明

### 1. 订单服务 (Order Service)
- 端口: 50051
- 功能: 管理送货点、订单状态
- API:
  - `CreateDeliveryPoint` - 创建送货点
  - `GetDeliveryPoints` - 获取订单的送货点列表
  - `UpdateDeliveryStatus` - 更新送货状态

### 2. 地图服务 (Map Service)
- 端口: 50052
- 功能: 调用OpenRouteService API计算路径
- API:
  - `CalculateRoute` - 计算路径
  - `GetDrivingInstructions` - 获取导航指令

### 3. 通知服务 (Notification Service)
- gRPC端口: 50053
- WebSocket端口: 8080
- 功能: 实时推送司机位置
- API:
  - `SubscribeDriverLocation` - 订阅司机位置流 (gRPC streaming)
  - `PublishDriverLocation` - 发布司机位置

## 安装和运行

### 前置要求
- Node.js 16+
- OpenRouteService API Key (地图服务需要)

### 安装依赖

```bash
# 安装订单服务依赖
cd order-service
npm install

# 安装地图服务依赖
cd ../map-service
npm install

# 安装通知服务依赖
cd ../notification-service
npm install

# 安装前端依赖
cd ../frontend
npm install
```

### 配置环境变量

在 `map-service` 目录下创建 `.env` 文件:
```
OPENROUTESERVICE_API_KEY=your_api_key_here
```

### 启动服务

```bash
# 终端1: 启动订单服务
cd order-service
npm start

# 终端2: 启动地图服务
cd map-service
npm start

# 终端3: 启动通知服务
cd notification-service
npm start

# 终端4: 启动前端
cd frontend
npm start
```

## Proto文件定义

`proto/routing.proto` 定义了所有服务的gRPC接口，包括:
- Location 消息类型
- DeliveryPoint 消息类型
- OrderService 服务
- MapService 服务
- NotificationService 服务 (支持流式RPC)

## 前端功能

- 使用Leaflet地图显示OpenStreetMap
- 实时显示司机位置 (蓝色汽车图标)
- 显示配送点位置 (绿色定位图标)
- 显示配送路径 (蓝色线条)
- WebSocket实时更新司机位置
- 信息面板显示当前位置和配送进度

## 技术栈

**后端服务:**
- Node.js
- gRPC (@grpc/grpc-js)
- Express (通知服务)
- ws (WebSocket)
- axios (HTTP客户端)

**前端:**
- React 18
- Leaflet / React-Leaflet
- WebSocket API

## 扩展建议

1. 添加数据库持久化 (MongoDB/PostgreSQL)
2. 添加API网关
3. 添加服务发现 (Consul/Etcd)
4. 添加链路追踪 (Jaeger)
5. 添加监控和日志
6. 添加认证授权 (JWT)
7. 使用Docker容器化部署
8. 添加测试用例

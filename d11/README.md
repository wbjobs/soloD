# 实时协作白板系统

一个支持多人实时协作的互动白板后端服务，使用 NestJS + Go 混合开发。

## 技术栈

- **NestJS**: 用户鉴权和房间管理 RESTful API
- **Go**: WebRTC 信令服务器和 WebSocket 广播
- **PostgreSQL**: 存储房间元数据
- **Nginx**: 前端静态页面服务和反向代理
- **Docker**: 容器化部署

## 快速开始

### 一键启动

```bash
docker-compose up --build
```

### 访问服务

- 前端页面: http://localhost
- NestJS API: http://localhost:3000
- Go 信令服务器: ws://localhost:8080/ws

## API 接口

### 创建房间
```
POST /rooms
Body: { "name": "房间名称", "creator": "用户名" }
Response: { "roomId": "xxx", "token": "xxx" }
```

### 加入房间
```
POST /rooms/:roomId/join
Body: { "username": "用户名" }
Response: { "roomId": "xxx", "token": "xxx", "exists": true }
```

### 获取房间信息
```
GET /rooms/:roomId
Response: { "id": "xxx", "name": "xxx", "creator": "xxx", "createdAt": "xxx" }
```

## 项目结构

```
.
├── nestjs-backend/      # NestJS API 服务
│   ├── src/
│   │   ├── room/       # 房间管理模块
│   │   ├── app.module.ts
│   │   └── main.ts
│   ├── Dockerfile
│   └── package.json
├── go-signaling/        # Go 信令服务器
│   ├── main.go
│   ├── go.mod
│   └── Dockerfile
├── frontend/            # 前端静态页面
│   ├── index.html
│   ├── nginx.conf
│   └── Dockerfile
└── docker-compose.yml
```

## 功能特性

- ✅ 创建/加入房间
- ✅ JWT 身份验证
- ✅ WebSocket 实时通信
- ✅ 白板绘制数据广播
- ✅ WebRTC 信令交换框架
- ✅ PostgreSQL 数据持久化
- ✅ Docker 一键部署

## 使用说明

1. 启动服务后，访问 http://localhost
2. 输入用户名和房间名称，点击"创建房间"
3. 或输入用户名和房间ID，点击"加入房间"
4. 在画布上绘制，房间内其他用户可以实时看到你的笔迹

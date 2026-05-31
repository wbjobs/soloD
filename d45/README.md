# 游戏后端服务 - Elo匹配系统

基于Golang实现的游戏后端服务，包含Elo积分自动匹配算法和WebSocket心跳机制。

## 功能特性

1. **Elo积分系统** - 标准的Elo积分计算和更新机制
2. **自动匹配算法** - 基于Elo积分的玩家匹配，支持Elo差值阈值
3. **WebSocket连接** - 实时双向通信
4. **心跳包机制** - 自动检测和维护连接活跃状态

## 项目结构

```
game-backend/
├── main.go                 # 主程序入口
├── go.mod                  # Go模块依赖
├── models/
│   └── player.go          # 玩家数据模型和Elo计算
├── matchmaker/
│   └── matchmaker.go      # 匹配算法实现
└── websocket/
    └── server.go          # WebSocket服务器和心跳机制
```

## 安装和运行

### 1. 安装依赖

```bash
# 设置Go代理（如果网络有问题）
go env -w GOPROXY=https://goproxy.cn,direct

# 下载依赖
go mod tidy
```

### 2. 运行服务

```bash
go run main.go
```

服务启动后：
- WebSocket地址: `ws://localhost:8080/ws`
- 测试页面: `http://localhost:8080/`

## API说明

### WebSocket消息类型

#### 客户端发送消息

1. **加入匹配队列**
```json
{
  "type": "join_queue"
}
```

2. **离开匹配队列**
```json
{
  "type": "leave_queue"
}
```

3. **心跳响应**
```json
{
  "type": "pong"
}
```

#### 服务器推送消息

1. **加入队列成功**
```json
{
  "type": "queue_joined",
  "payload": {
    "playerId": "xxx",
    "elo": 1000.0
  }
}
```

2. **离开队列成功**
```json
{
  "type": "queue_left",
  "payload": {
    "playerId": "xxx"
  }
}
```

3. **匹配成功**
```json
{
  "type": "match_found",
  "payload": {
    "match": {
      "matchId": "xxx",
      "playerA": { "id": "xxx", "name": "xxx", "elo": 1000.0 },
      "playerB": { "id": "xxx", "name": "xxx", "elo": 1000.0 }
    },
    "opponent": { "id": "xxx", "name": "xxx", "elo": 1000.0 },
    "you": { "id": "xxx", "name": "xxx", "elo": 1000.0 }
  }
}
```

4. **心跳包** (每10秒发送)
```json
{
  "type": "heartbeat",
  "payload": {
    "timestamp": 1234567890
  }
}
```

## 技术实现

### Elo积分算法
- K因子: 32
- 预期胜率计算: 1 / (1 + 10^((对手Elo - 玩家Elo)/400))
- Elo更新: 新Elo = 旧Elo + K * (实际胜负 - 预期胜率)

### 匹配算法
- 匹配间隔: 500ms
- 最大允许Elo差值: 100分
- 优先匹配Elo最接近的玩家

### 心跳机制
- 心跳间隔: 10秒
- 超时时间: 30秒（无响应则断开连接）

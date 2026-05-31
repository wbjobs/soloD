# 多人在线回合制卡牌对战游戏后端服务

基于 Go + gRPC + Redis + PostgreSQL 开发的多人在线回合制卡牌对战游戏后端服务。

## 功能特性

### 1. 用户认证系统
- 用户注册
- 用户登录（JWT Token）
- 获取用户信息

### 2. 匹配系统
- 基于评分的玩家匹配
- 匹配队列管理
- 匹配状态查询
- 取消匹配

### 3. 卡牌对战核心逻辑
- 卡牌效果系统（法术伤害、治疗、嘲讽、潜行、燃烧等）
- 回合制战斗流程
- 法力值管理（每回合递增）
- 抽卡机制
- 随从战场管理

### 4. 游戏状态同步
- gRPC 流式通信
- 实时游戏事件广播
- 多客户端状态一致性保证

### 5. 排行榜与对战记录
- 玩家排行榜（按评分排序）
- 对战历史记录
- 评分变化追踪
- 胜负统计

## 技术栈

- **Go 1.26+**: 高性能后端语言
- **gRPC**: 高性能 RPC 框架，支持流式通信
- **PostgreSQL**: 关系型数据库，持久化存储用户数据和对战记录
- **Redis**: 内存数据库，用于匹配队列和实时状态管理
- **JWT**: 用户认证和授权

## 项目结构

```
cardgame/
├── cmd/
│   └── server/
│       └── main.go          # 服务入口
├── internal/
│   ├── auth/                # 认证服务
│   │   └── service.go
│   ├── matchmaking/         # 匹配服务
│   │   └── service.go
│   ├── game/                # 游戏服务
│   │   └── service.go
│   ├── ranking/             # 排行榜服务
│   │   └── service.go
│   ├── models/              # 数据模型
│   │   └── card.go
│   ├── config/              # 配置管理
│   │   └── config.go
│   └── db/                  # 数据库连接
│       ├── postgres.go
│       └── redis.go
├── proto/                   # gRPC 协议定义
│   └── cardgame.proto
├── pkg/                     # 工具包
│   └── utils/
│       └── jwt.go
├── go.mod
├── go.sum
├── .env                     # 环境变量
└── README.md
```

## 快速开始

### 前置要求

1. Go 1.26 或更高版本
2. PostgreSQL 12+
3. Redis 6+
4. Protocol Buffers 编译器（protoc）

### 1. 数据库准备

#### PostgreSQL

```sql
-- 创建数据库
CREATE DATABASE cardgame;

-- 连接到数据库
\c cardgame;

-- 表结构会在服务启动时自动创建
```

### 2. 环境配置

复制 `.env` 文件并根据你的环境修改：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
SERVER_PORT=:50051

POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
POSTGRES_DB=cardgame
POSTGRES_SSLMODE=disable

REDIS_ADDR=localhost:6379
REDIS_PASSWORD=
REDIS_DB=0

JWT_SECRET=your-super-secret-key-change-this-in-production
```

### 3. 生成 gRPC 代码

```bash
# 安装 protoc 插件
go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.31
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.3

# 生成代码
protoc --go_out=. --go_opt=paths=source_relative \
    --go-grpc_out=. --go-grpc_opt=paths=source_relative \
    proto/cardgame.proto
```

### 4. 安装依赖

```bash
go mod tidy
```

### 5. 启动服务

```bash
go run cmd/server/main.go
```

服务将在 `localhost:50051` 启动。

## gRPC 服务接口

### AuthService（认证服务）

#### Register - 用户注册
```protobuf
rpc Register(RegisterRequest) returns (RegisterResponse)

message RegisterRequest {
  string username = 1;
  string password = 2;
}

message RegisterResponse {
  bool success = 1;
  string message = 2;
  string user_id = 3;
}
```

#### Login - 用户登录
```protobuf
rpc Login(LoginRequest) returns (LoginResponse)

message LoginRequest {
  string username = 1;
  string password = 2;
}

message LoginResponse {
  bool success = 1;
  string message = 2;
  string token = 3;
  User user = 4;
}
```

#### GetUserInfo - 获取用户信息
```protobuf
rpc GetUserInfo(GetUserInfoRequest) returns (GetUserInfoResponse)

message GetUserInfoRequest {
  string user_id = 1;
}
```

### MatchmakingService（匹配服务）

#### FindMatch - 开始匹配
```protobuf
rpc FindMatch(FindMatchRequest) returns (FindMatchResponse)

message FindMatchRequest {
  string user_id = 1;
}
```

#### GetMatchStatus - 查询匹配状态
```protobuf
rpc GetMatchStatus(GetMatchStatusRequest) returns (GetMatchStatusResponse)

message GetMatchStatusResponse {
  string status = 1;        // searching, matched, idle
  string match_id = 2;
  string opponent_id = 3;
  string opponent_name = 4;
}
```

#### CancelMatch - 取消匹配
```protobuf
rpc CancelMatch(CancelMatchRequest) returns (CancelMatchResponse)
```

### GameService（游戏服务）

#### ConnectGame - 连接游戏（流式）
```protobuf
rpc ConnectGame(ConnectGameRequest) returns (stream GameEvent)

message GameEvent {
  string type = 1;          // game_start, card_played, turn_ended
  string message = 2;
  GameState state = 3;
}
```

#### PlayCard - 打出卡牌
```protobuf
rpc PlayCard(PlayCardRequest) returns (PlayCardResponse)

message PlayCardRequest {
  string user_id = 1;
  string match_id = 2;
  string card_id = 3;
  int32 target_index = 4;
}
```

#### EndTurn - 结束回合
```protobuf
rpc EndTurn(EndTurnRequest) returns (EndTurnResponse)
```

#### GetGameState - 获取游戏状态
```protobuf
rpc GetGameState(GetGameStateRequest) returns (GetGameStateResponse)
```

### RankingService（排行榜服务）

#### GetLeaderboard - 获取排行榜
```protobuf
rpc GetLeaderboard(GetLeaderboardRequest) returns (GetLeaderboardResponse)

message GetLeaderboardRequest {
  int32 limit = 1;          // 默认 10，最大 100
}
```

#### GetMatchHistory - 获取对战历史
```protobuf
rpc GetMatchHistory(GetMatchHistoryRequest) returns (GetMatchHistoryResponse)

message GetMatchHistoryRequest {
  string user_id = 1;
  int32 limit = 2;          // 默认 20，最大 50
}
```

## 卡牌系统

### 卡牌类型

| 卡牌名称 | 费用 | 攻击 | 生命 | 效果 | 描述 |
|---------|------|------|------|------|------|
| Warrior | 2 | 3 | 2 | none | 基础战士单位 |
| Archer | 2 | 2 | 3 | none | 基础射手单位 |
| Mage | 3 | 4 | 2 | spell_damage | 召唤时造成 2 点伤害 |
| Healer | 3 | 1 | 4 | heal | 召唤时恢复 2 点生命 |
| Tank | 4 | 2 | 6 | taunt | 嘲讽，必须优先攻击 |
| Assassin | 3 | 5 | 1 | stealth | 潜行一回合 |
| Giant | 5 | 5 | 5 | none | 强力巨人单位 |
| Dragon | 7 | 7 | 7 | burn | 每回合对敌方造成 1 点燃烧伤害 |

### 游戏规则

1. **初始状态**：每位玩家 30 点生命，1 点法力，手牌 3 张
2. **法力增长**：每回合最大法力 +1（上限 10），当前法力恢复至满
3. **抽卡**：每回合开始时抽一张牌
4. **胜利条件**：将对方生命值降至 0 或以下

## 数据库设计

### users 表
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  level INT DEFAULT 1,
  rating INT DEFAULT 1000,
  wins INT DEFAULT 0,
  losses INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### match_history 表
```sql
CREATE TABLE match_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player1_id UUID REFERENCES users(id),
  player2_id UUID REFERENCES users(id),
  winner_id UUID REFERENCES users(id),
  player1_rating_change INT DEFAULT 0,
  player2_rating_change INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## Redis 数据结构

- **匹配队列**：Sorted Set，键 `match_queue`，按 rating 排序
- **匹配状态**：String，键 `match_status:{user_id}`
- **匹配结果**：Hash，键 `match_ready:{user_id}`

## 游戏流程示例

1. **玩家 A 和 B 注册账号**
   - 调用 `AuthService.Register`

2. **玩家登录**
   - 调用 `AuthService.Login`，获取 Token

3. **开始匹配**
   - 双方调用 `MatchmakingService.FindMatch`
   - 轮询 `GetMatchStatus` 直到匹配成功

4. **连接游戏**
   - 调用 `GameService.ConnectGame` 建立流式连接
   - 接收 `game_start` 事件

5. **进行游戏**
   - 回合玩家调用 `PlayCard` 打出卡牌
   - 调用 `EndTurn` 结束回合
   - 通过流接收实时游戏状态

6. **游戏结束**
   - 一方生命值归零时游戏结束
   - 评分自动更新（胜者 +15，败者 -15）

7. **查看战绩**
   - 调用 `RankingService.GetLeaderboard` 查看排行榜
   - 调用 `RankingService.GetMatchHistory` 查看对战历史

## 开发建议

### 安全性
1. 生产环境务必修改 JWT_SECRET
2. 启用 PostgreSQL SSL 模式
3. 为 Redis 设置密码
4. 实现请求频率限制

### 性能优化
1. 为 Redis 实现连接池
2. 添加游戏状态缓存
3. 实现数据库读写分离
4. 添加 gRPC 拦截器进行日志和监控

### 功能扩展
1. 添加好友系统
2. 实现卡牌收藏和卡组构建
3. 添加游戏内聊天
4. 实现观战功能
5. 添加排位赛和赛季系统

## 许可证

MIT License

# 基于终端的多人地牢游戏

这是一个客户端-服务器架构的多人地牢游戏，服务端使用C++和Entt ECS框架，客户端使用Python和curses库。

## 功能特性

- **服务端 (C++)**:
  - 使用 Entt 库实现 ECS (实体-组件-系统) 架构
  - BSP (二叉空间分割) 树算法随机生成地牢地图
  - Telnet 服务器支持多客户端连接
  - 服务端校验移动合法性（不能穿墙、不能重叠）
  - 线程安全的游戏状态同步
  - 实时同步游戏状态给所有客户端
  - **怪物AI系统**: 哥布林(G)、兽人(O)、骷髅(S)、恶魔(D)
  - **怪物自动追踪**: 玩家进入15格范围时怪物会自动追击

- **客户端 (Python)**:
  - 使用 curses 库实现终端 UI
  - 支持 Telnet 协议连接服务端
  - WASD / 方向键 控制移动
  - 自动处理乱码和特殊字符
  - 按键冷却防止输入过快
  - 实时显示怪物位置和移动

## 项目结构

```
dungeon-game/
├── server/
│   ├── CMakeLists.txt           # C++ 构建配置
│   ├── server.py                # Python 演示服务端（可直接运行）
│   ├── src/
│   │   ├── main.cpp             # 程序入口
│   │   ├── bsp_map.cpp          # BSP 地图生成实现
│   │   └── game_server.cpp      # 游戏服务器实现
│   └── include/
│       ├── components.hpp       # ECS 组件定义
│       ├── bsp_map.hpp          # BSP 地图类
│       └── game_server.hpp      # 游戏服务器类
└── client/
    └── client.py                # Python 游戏客户端
```

## 编译运行

### 快速开始（Python演示版）

由于C++编译需要环境配置，我们提供了功能完全一致的Python演示版本：

**启动服务端：**
```bash
cd server
python server.py
```

**启动客户端（新开终端）：**
```bash
cd client
python client.py
```

可以同时启动多个客户端测试多人游戏！

### C++ 服务端编译

**使用 CMake:**
```bash
cd server
mkdir build && cd build
cmake ..
make
./dungeon_server
```

**Windows MinGW:**
```bash
cd server
g++ -std=c++17 src/main.cpp src/bsp_map.cpp src/game_server.cpp -Iinclude -lws2_32 -o dungeon_server.exe
dungeon_server.exe
```

### 运行客户端

```bash
cd client
python client.py

# 连接到指定服务器
python client.py --host 192.168.1.100 --port 2323
```

## 游戏操作

- `W` / 上方向键: 向上移动
- `S` / 下方向键: 向下移动
- `A` / 左方向键: 向左移动
- `D` / 右方向键: 向右移动
- `ESC`: 退出游戏

## 地图符号说明

- `@`: 你的玩家角色
- `P`: 其他在线玩家
- `#`: 墙壁
- `.`: 地面

## 技术细节

### BSP 地图生成 ([bsp_map.hpp](file:///E:/soloD/d96/server/include/bsp_map.hpp))

- 使用智能指针管理内存，防止内存泄漏
- 递归分割地图空间创建房间
- 在兄弟节点间生成走廊连接
- 边界检查确保房间和走廊不会越界

### ECS 架构 ([components.hpp](file:///E:/soloD/d96/server/include/components.hpp))

- **Position 组件**: 存储实体坐标
- **Player 组件**: 玩家信息（名称、ID）
- **Enemy 组件**: 敌人信息（预留）

### 服务端移动校验 ([game_server.cpp](file:///E:/soloD/d96/server/src/game_server.cpp#L190-L214))

1. 检查目标坐标是否为地面（可通行）
2. 检查目标坐标是否被其他玩家占据
3. 检查目标坐标是否被怪物占据
4. 只有服务端校验通过后才更新坐标

### 怪物AI系统 ([game_server.cpp](file:///E:/soloD/d96/server/src/game_server.cpp#L241-L318))

- **怪物生成**: 8只随机类型的怪物（哥布林、兽人、骷髅、恶魔）
- **追踪范围**: 玩家进入15格范围时开始追击
- **移动速度**: 每0.3秒移动一格
- **寻路算法**: 简单贪心算法，优先向玩家的X或Y方向移动
- **线程安全**: 独立AI线程，使用mutex保护共享数据

### 客户端渲染优化 ([client.py](file:///E:/soloD/d96/client/client.py#L77-L113))

- 过滤不可打印字符防止乱码
- 自动截断超长行
- 线程安全的显示缓冲区
- 按键冷却防止输入过载

## 网络协议

- 协议: TCP (类 Telnet)
- 端口: 2323
- 编码: UTF-8
- 换行: CRLF (\r\n)
- 控制码: ANSI 转义序列控制光标位置

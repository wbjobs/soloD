# 分布式任务队列原型

一个基于 ZeroMQ 的简单分布式任务队列系统，包含三个组件。

## 架构概述

```
┌─────────────┐     PUSH     ┌─────────────┐
│  Publisher  │ ───────────> │   Workers   │
│   (C++)     │                │  (Python)   │
└─────────────┘                └──────┬──────┘
                                      │ PUSH
                                      ▼
                                ┌───────────┐
                                │   Sink    │
                                │ (Node.js) │
                                └───────────┘
```

## 端口配置

- **Publisher**: `tcp://*:5557` (PUSH socket，绑定)
- **Sink**: `tcp://*:5558` (PULL socket，绑定)
- **Worker**: 连接到两个端口

---

## ZeroMQ PUSH/PULL 模式详解

### 连接行为

ZeroMQ 的 PUSH/PULL 模式具有以下特性：

#### 1. **异步连接机制**
- `connect()` 调用会立即返回，不会阻塞等待连接建立
- ZeroMQ 在后台尝试连接，即使另一端还没有启动也不会报错
- 消息会在本地队列中缓冲，直到连接建立

#### 2. **启动顺序问题**

**问题表现：**
如果先启动 Publisher 再启动 Worker，Publisher 发送的第一条消息可能会丢失。

**原因：**
- PUSH socket 在没有连接的 Worker 时，消息会被丢弃（默认 HWM 很高但不是无限）
- Worker 的连接需要时间建立（TCP 三次握手）
- 在此期间发送的消息可能会丢失

#### 3. **消息分发机制**
- PUSH socket 使用**轮询（Round-Robin）**方式分发消息
- 多个 Worker 连接时，消息会均匀分配
- 如果某个 Worker 处理慢，会导致该 Worker 的消息积压

---

## 启动顺序问题解决方案

### 方案 1：延迟发送（已实现）

在 Publisher 发送前等待 2 秒，确保 Worker 有时间连接：

```cpp
std::cout << "等待 Worker 连接... (2秒)" << std::endl;
std::this_thread::sleep_for(std::chrono::seconds(2));
```

**优点：** 简单直接
**缺点：** 固定延迟时间不好确定

### 方案 2：使用 zmq_proxy（推荐用于生产环境）

创建一个代理程序，作为中间层转发消息：

```cpp
// proxy.cpp
#include <zmq.hpp>

int main() {
    zmq::context_t context(1);
    
    zmq::socket_t frontend(context, ZMQ_PULL);
    frontend.bind("tcp://*:5557");  // Publisher 连接这里
    
    zmq::socket_t backend(context, ZMQ_PUSH);
    backend.bind("tcp://*:5559");  // Worker 连接这里
    
    zmq::proxy(frontend, backend, nullptr);
    
    return 0;
}
```

**优点：**
- Publisher 和 Worker 启动顺序无关
- 可以动态添加/移除 Worker
- 消息不会丢失

### 方案 3：同步启动（当前推荐的方式）

**正确的启动顺序：

1. **先启动 Sink**（绑定端口，等待结果）
2. **再启动 Worker**（连接到 Publisher 和 Sink）
3. **最后启动 Publisher**（发送任务）

这样可以确保：
- Worker 已经连接建立后才开始发送任务
- 消息不会丢失

---

## 安装依赖

### 1. C++ (Publisher)

**Windows 推荐使用 MSYS2：

```bash
# 安装 MSYS2 后，在 MSYS2 MinGW 64-bit 终端运行：
pacman -S mingw-w64-x86_64-zeromq mingw-w64-x86_64-gcc make cmake
```

**编译方式：**

```bash
# 方式 1: 使用批处理脚本（最简单）
build.bat

# 方式 2: 直接编译
g++ publisher.cpp -o publisher.exe -lzmq -std=c++17

# 方式 3: 使用 CMake
mkdir build
cd build
cmake .. -G "MinGW Makefiles"
mingw32-make
```

### 2. Python (Worker)
```bash
pip install -r requirements.txt
```

### 3. Node.js (Sink)
```bash
npm install
```

---

## 运行方式

### 推荐启动顺序（重要！）

**必须按以下顺序启动，每个程序在独立的独立终端：

### 终端 1 - 启动 Sink（结果收集器）：
```bash
node sink.js
```

### 终端 2 - 启动 Worker（可以启动多个）：
```bash
python worker.py
```

### 终端 3 - 启动 Publisher（任务发布者）：
```bash
# Windows:
publisher.exe

# 或者直接运行：
.\publisher.exe
```

### 并行处理演示

启动多个 Worker 可以实现真正的并行计算：

```bash
# 终端 2 - Worker 1
python worker.py

# 终端 3 - Worker 2
python worker.py

# 终端 4 - Publisher
publisher.exe
```

Sink 输出的 "加速比" 会显示并行效果！

---

## 任务文件格式

`tasks.txt` 文件中每行一个数字，这些数字将用于计算斐波那契数列：
```
10
15
20
25
30
35
40
```

---

## 工作流程

1. **Publisher** 读取 `tasks.txt`，将每行数字打包成任务（格式：`task_id,number`），通过 PUSH socket 发送
2. **Worker** 通过 PULL socket 接收任务，计算斐波那契数列，然后通过 PUSH socket 将结果发送给 Sink
3. **Sink** 收集所有 Worker 的结果，打印统计信息

---

## 消息格式

### Publisher -> Worker
```
task_id,number
例如: 1,30
```

### Worker -> Sink
```
task_id,number,result,elapsed_time
例如: 1,30,832040,0.0501
```

---

## 故障排查

### 问题 1: 消息丢失
**症状：** Sink 收不到所有任务的结果
**解决方案：**
1. 确保按正确的启动顺序（Sink -> Worker -> Publisher
2. 检查 Publisher 的等待时间是否足够
3. 考虑使用 zmq_proxy 方案

### 问题 2: 编译错误
**症状：** g++ 找不到 zmq.hpp
**解决方案：**
1. 确保正确安装了 ZeroMQ 开发库
2. 使用 MSYS2 环境，因为它提供了完整的 ZeroMQ 包

### 问题 3: Worker 无响应
**症状：** Worker 启动后没有收到任务
**解决方案：**
1. 检查 Publisher 是否启动
2. 检查端口是否被防火墙阻止
3. 确认所有程序使用相同的端口号

---

## 性能优化建议

1. **使用多个 Worker 实现并行计算
2. 调整任务粒度（更大的数字增加计算时间
3. 使用 zmq_proxy 提高系统弹性
4. 考虑使用 ZMQ_PUB/ZMQ_PULL 模式替代 PUSH/PULL

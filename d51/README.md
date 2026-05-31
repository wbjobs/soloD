# WebRTC 多方音视频会议系统 - 码率自适应调节模块

基于 WebRTC 的多方音视频会议系统，实现了基于 GCC（Google Congestion Control）拥塞控制算法的码率自适应调节功能。

## 功能特性

### 1. 码率自适应调节
- 根据网络状况（丢包率、RTT）动态调整视频编码器的目标码率
- 支持三档质量等级：高（High）、中（Medium）、低（Low）
- 自动调整分辨率和帧率以适应当前带宽

### 2. Simulcast 多层质量流
- 发送端同时编码三层视频流（高/中/低）
- 接收端根据下行带宽自动选择接收合适质量的流
- 每层配置不同的比特率、分辨率和帧率上限

### 3. GCC 拥塞控制算法模拟
- 客户端每 500ms 上报一次网络统计信息
- 服务端基于 GCC 算法计算推荐码率
- 考虑因素：丢包率、RTT、可用带宽估计

### 4. 历史带宽轨迹存储
- 后端存储每个会话的带宽历史数据
- 支持离线分析和策略优化
- 数据持久化到日志文件

## 技术栈

### 前端
- React 18 + TypeScript
- WebRTC API
- Socket.io-client
- Vite

### 后端
- Node.js
- Express
- Socket.io
- 文件系统持久化

## 项目结构

```
d51/
├── backend/                    # 后端服务
│   ├── src/
│   │   ├── index.js           # 主入口文件
│   │   ├── controllers/
│   │   │   └── GCCController.js    # GCC拥塞控制器
│   │   └── utils/
│   │       └── BandwidthTracker.js # 带宽追踪器
│   └── package.json
└── frontend/                   # 前端应用
    ├── src/
    │   ├── types/
    │   │   └── webrtc.ts      # TypeScript类型定义
    │   ├── services/
    │   │   ├── SignalingService.ts  # 信令服务
    │   │   └── WebRTCManager.ts     # WebRTC管理器
    │   ├── App.tsx            # 主组件
    │   ├── main.tsx           # 入口文件
    │   └── index.css          # 样式文件
    ├── index.html
    ├── vite.config.ts
    ├── tsconfig.json
    └── package.json
```

## 快速开始

### 1. 启动后端服务

```bash
cd backend
npm install
npm start
```

后端服务将在 `http://localhost:3001` 启动。

### 2. 启动前端应用

```bash
cd frontend
npm install
npm run dev
```

前端应用将在 `http://localhost:3000` 启动。

### 3. 加入会议

1. 打开浏览器访问 `http://localhost:3000`
2. 输入房间 ID 和用户 ID
3. 点击"加入房间"
4. 允许摄像头和麦克风权限
5. 在另一个浏览器窗口/标签页重复上述步骤加入同一房间

## 核心算法说明

### GCC 拥塞控制算法

GCC（Google Congestion Control）是 WebRTC 默认的拥塞控制算法，主要包含两个主要部分：

1. **基于丢包的控制**：当丢包率超过阈值时降低码率
2. **基于延迟的控制**：当RTT超过阈值时降低码率

本项目实现了简化版的 GCC 算法：

```javascript
// 码率调整策略
if (packetLoss < 0.02 && rtt < 100) {
  // 网络良好，尝试提升码率
  bitrate *= 1.05;
} else if (packetLoss > 0.05 || rtt > 200) {
  // 网络拥塞，降低码率
  bitrate *= 0.8;
}
```

### Simulcast 配置

```typescript
const simulcastEncodings = [
  { rid: 'high', maxBitrate: 2500000, scaleResolutionDownBy: 1, maxFramerate: 30 },
  { rid: 'medium', maxBitrate: 1000000, scaleResolutionDownBy: 2, maxFramerate: 24 },
  { rid: 'low', maxBitrate: 300000, scaleResolutionDownBy: 4, maxFramerate: 15 }
];
```

## API 接口

### 带宽历史查询

```
GET /api/bandwidth-history/:roomId
```

返回指定房间的带宽历史数据。

## 数据统计

系统每 500ms 收集并上报以下统计信息：

- 当前码率 (bitrate)
- 丢包率 (packetLoss)
- 往返时间 (RTT)
- 发送字节数
- 接收字节数

## 质量等级映射

| 等级 | 码率范围 | 分辨率 | 帧率 |
|------|----------|--------|------|
| 高 | ≥ 2 Mbps | 1280x720 | 30 fps |
| 中 | 0.8 - 2 Mbps | 640x480 | 24 fps |
| 低 | < 0.8 Mbps | 320x240 | 15 fps |

## 数据有效性校验机制

为了解决弱网环境下 WebRTC `getStats()` 返回 NaN 值导致的统计异常问题，实现了多层数据校验机制：

### 前端校验 (WebRTCManager.ts)

1. **`isValidNumber(value)`**
   - 检查值是否为有效的数字
   - 排除 NaN、Infinity 和非数值类型
   
2. **`calculateWeightedAverage(history)`**
   - 使用最近 3 次有效值的加权平均
   - 权重分配: [0.5, 0.3, 0.2] (最新值权重最高)

3. **`getValidValue(field, currentValue, fieldName)`**
   - 对每个统计字段进行有效性检查
   - 异常时使用历史加权平均作为降级方案
   - 在控制台输出警告日志，便于调试

4. **受保护的统计字段**
   - `packetLoss` - 丢包率
   - `rtt` - 往返时间
   - `bytesSent` - 发送字节数
   - `bytesReceived` - 接收字节数

### 后端校验 (GCCController.js + index.js)

1. **入口层校验 (index.js)**
   - 校验统计数据格式完整性
   - 对 NaN 值进行初步的默认值修正
   
2. **算法层校验 (GCCController.js)**
   - 维护每个用户独立的统计历史
   - 使用相同的加权平均算法计算降级值
   - 记录警告日志

### 降级策略示例

```javascript
// 正常情况: 直接使用数值并缓存
packetLoss = 0.01 → 使用 0.01，加入历史记录

// 异常情况: 使用历史加权平均
packetLoss = NaN → 
  历史: [0.03, 0.02, 0.01]
  计算: 0.03 * 0.5 + 0.02 * 0.3 + 0.01 * 0.2 = 0.023
  使用: 0.023

// 控制台输出警告
[WebRTC Stats] 丢包率 值异常: NaN, 使用历史加权平均值作为降级方案: 0.023
```

## ML 带宽预测功能

### 概述

系统集成了基于 LSTM 的机器学习模型来预测未来带宽趋势，与传统 GCC 算法进行加权融合，提供更平滑的码率调节。

### 模型架构

- **输入**: 最近 30 个时间点的统计数据 (丢包率、RTT、当前码率)
- **网络结构**: 2 层 LSTM + Dropout
- **输出**: 三分类概率分布 (带宽上升 / 稳定 / 下降)
- **框架**: TensorFlow.js

### 加权融合策略

```
最终推荐码率 = GCC 输出 * 0.7 + ML 预测 * 0.3
```

- **实时测量权重**: 70% - 基于当前网络统计的 GCC 算法输出
- **ML 预测权重**: 30% - 基于历史趋势的 LSTM 模型预测

### 平滑机制

为了避免频繁的码率波动，系统采用指数移动平均（EMA）平滑：

```
平滑后码率 = 上一码率 * 0.85 + 新推荐码率 * 0.15
```

### 降级方案

如果 ML 模型加载失败，系统会自动降级到基于启发式规则的预测器：

- **趋势判断**: 基于最近 10 个时间点的斜率计算
- **置信度**: 基于网络指标稳定性的动态计算
- **用户无感切换**: 不影响正常的码率调节功能

## A/B 测试框架

### 模型版本管理

后端提供完整的模型生命周期管理：

```bash
# 获取所有可用模型
GET /api/model/all

# 获取默认模型配置
GET /api/model/config?userId=user1

# 更新默认模型
POST /api/model/default { "modelId": "lstm_v1.1" }

# 注册新模型
POST /api/model/register { ... }
```

### 实验管理

创建和管理 A/B 测试实验：

```bash
# 创建实验
POST /api/experiment/create {
  "name": "新模型v1.1测试",
  "variants": [
    { "modelId": "lstm_v1.0", "weight": 0.5, "name": "control" },
    { "modelId": "lstm_v1.1", "weight": 0.5, "name": "treatment" }
  ],
  "trafficAllocation": 0.5
}

# 启动实验
POST /api/experiment/{id}/start

# 停止实验
POST /api/experiment/{id}/stop

# 获取实验结果
GET /api/experiment/{id}/results
```

### 用户分配

- 基于 userId 的确定性分配
- 支持按流量百分比分配到不同实验组
- 实验结果自动收集和聚合：QoE 指标、调整频率、稳定性指标

## API 端点汇总

### 统计和码率相关
- `GET /api/bandwidth-history/:roomId` - 获取房间带宽历史

### 模型管理
- `GET /api/model/config?userId={id}` - 获取用户模型配置
- `GET /api/model/all` - 获取所有可用模型
- `GET /api/model/active` - 获取激活模型列表
- `POST /api/model/default` - 设置默认模型
- `POST /api/model/register` - 注册新模型
- `PUT /api/model/:modelId/status` - 更新模型状态

### A/B 实验管理
- `POST /api/experiment/create` - 创建新实验
- `POST /api/experiment/:id/start` - 启动实验
- `POST /api/experiment/:id/stop` - 停止实验
- `GET /api/experiment/all` - 获取所有实验
- `GET /api/experiment/:id/results` - 获取实验结果
- `GET /api/experiment/stats` - 获取活跃实验统计

### GCC 调优
- `GET /api/gcc/ml-weight` - 获取 ML 预测权重
- `POST /api/gcc/ml-weight` - 设置 ML 预测权重

## 运行项目

### 1. 生成测试模型（首次运行）

```bash
cd backend
node scripts/generate-dummy-model.js
```

### 2. 启动后端服务

```bash
cd backend
npm install
npm start
```

服务器运行在 `http://localhost:3001`

### 3. 启动前端应用

```bash
cd frontend
npm install
npm run dev
```

前端应用运行在 `http://localhost:3000`

### 4. 测试会议功能

1. 打开两个浏览器窗口访问 `http://localhost:3000`
2. 输入相同的房间 ID 和不同的用户 ID
3. 点击"加入房间"
4. 观察网络状态面板和 ML 预测面板

## 浏览器兼容性

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## 注意事项

1. 需要 HTTPS 环境才能在公网使用 WebRTC（本地开发 localhost 除外）
2. 生产环境需要配置 TURN 服务器以支持 NAT 穿透
3. 摄像头和麦克风权限是必须的
4. 建议使用最新版本的现代浏览器

## 未来优化方向

1. **ML 模型优化**
   - 使用真实 WebRTC 统计数据训练 LSTM 模型
   - 实现模型在线学习和动态更新
   - 添加注意力机制提高长期趋势预测准确性
   - 支持 Transformer 架构的时序预测

2. **GCC 算法完善**
   - 实现完整的 GCC 算法（包括趋势滤波器和过载检测器）
   - 添加带宽估计器（BWE）
   - 支持灵活的编码器参数配置

3. **A/B 测试增强**
   - 集成统计显著性检验
   - 实时实验监控仪表板
   - 自动实验停止和最佳模型选择

4. **QoS 和用户体验**
   - 添加 QoS 监控和告警系统
   - 实现更精细的 Simulcast 动态切换
   - 添加屏幕共享功能
   - 支持录制和回放
   - 视频质量客观评估 (VMAF, PSNR)

## 许可证

MIT License

# WebRTC 多方音视频会议系统 - 自适应码率调节模块

基于 WebRTC 的多方音视频会议系统，实现了自适应码率调节、GCC 拥塞控制和 Simulcast 多层编码功能。

## 技术架构

### 后端
- Node.js + TypeScript
- Socket.io 信令服务器
- GCC (Google Congestion Control) 拥塞控制算法
- 带宽历史记录存储

### 前端
- React 18 + TypeScript
- WebRTC PeerConnection
- Simulcast 三层编码 (高/中/低)
- Recharts 数据可视化

## 核心功能

### 1. 网络状态监测
- 实时监控可用带宽
- 丢包率统计
- RTT (往返时间) 延迟测量

### 2. GCC 拥塞控制算法
- 基于丢包率的码率调节
- 基于延迟梯度的拥塞检测
- 码率平滑上升/下降机制

### 3. 自适应码率调节
- 动态调整目标码率 (100kbps - 5Mbps)
- 自动切换分辨率 (320x240, 640x480, 1280x720)
- 自动调整帧率 (15fps, 24fps, 30fps)

### 4. Simulcast 多层编码
- 高清层 (High): 720p, 30fps, 2.5Mbps
- 标清层 (Medium): 480p, 24fps, 1Mbps
- 流畅层 (Low): 240p, 15fps, 300kbps

### 5. 带宽历史记录
- 服务器端存储每个会话的带宽轨迹
- 支持离线分析和策略优化
- 实时图表展示带宽变化趋势

## 项目结构

```
d61/
├── backend/
│   ├── src/
│   │   ├── server.ts           # Socket.io 信令服务器
│   │   ├── adaptiveBitrate.ts  # 自适应码率和 GCC 算法
│   │   └── types.ts            # 类型定义
│   ├── package.json
│   └── tsconfig.json
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── VideoConference.tsx    # 视频会议组件
    │   │   ├── NetworkMonitorPanel.tsx # 网络监控面板
    │   │   └── RoomControl.tsx        # 房间控制组件
    │   ├── hooks/
    │   │   └── useWebRTC.ts    # WebRTC 核心逻辑 Hook
    │   ├── utils/
    │   │   ├── networkMonitor.ts   # 网络监测工具
    │   │   └── bitrateController.ts # 码率控制工具
    │   ├── types.ts            # 类型定义
    │   ├── App.tsx            # 主应用组件
    │   └── index.tsx          # 入口文件
    ├── package.json
    └── tsconfig.json
```

## 快速开始

### 1. 启动后端服务器

```bash
cd backend
npm install
npm run dev
```

服务器将在 http://localhost:3001 启动

### 2. 启动前端应用

```bash
cd frontend
npm install
npm start
```

前端应用将在 http://localhost:3000 启动

## 使用说明

1. 确保后端服务器正在运行 (端口 3001)
2. 打开前端页面，输入房间号和用户名
3. 点击"加入房间"，允许浏览器访问摄像头和麦克风
4. 在另一台设备或浏览器窗口加入同一房间
5. 观察网络状态面板中的实时数据变化

## API 接口

### 获取房间历史数据

```
GET /api/room/:roomId/history
```

返回指定房间的带宽历史记录和参与者信息。

## 码率自适应策略

### 质量等级判定

| 等级 | 码率范围 | 分辨率 | 帧率 | 网络条件 |
|------|----------|--------|------|----------|
| 高清 | > 2Mbps  | 1280x720 | 30fps | 丢包 < 2%, RTT < 100ms |
| 标清 | 0.8-2Mbps | 640x480 | 24fps | 丢包 2%-5%, RTT 100-200ms |
| 流畅 | < 0.8Mbps | 320x240 | 15fps | 丢包 > 5%, RTT > 200ms |

### GCC 状态机

- **提升状态 (Increase)**: 网络良好，逐步提升码率 (8% 增益)
- **稳定状态 (Stable)**: 网络波动，保持当前码率
- **降低状态 (Decrease)**: 网络拥塞，快速降低码率

## 核心算法实现

### 丢包率计算
```typescript
packetLossRate = packetsLost / (packetsSent + packetsLost)
```

### 带宽估计
```typescript
availableBandwidth = currentBitrate * (1 - packetLossRate * 2) - (rtt - 50) * 2000
```

### 码率调整
- 上升: 每次增加 8%，不超过可用带宽的 90%
- 下降: 根据丢包率和延迟线性下降，最少 50%
- 最小码率: 100kbps，最大码率: 5Mbps

## 注意事项

1. 需要 HTTPS 或 localhost 环境才能访问媒体设备
2. 不同浏览器的 WebRTC stats API 可能有差异
3. Simulcast 功能需要浏览器支持 (Chrome, Firefox, Edge)
4. 实际网络状况可能导致码率调整有延迟

## 扩展建议

- 集成 TURN 服务器支持 NAT 穿透
- 添加音频码率自适应控制
- 实现 REMB/TWCC 反馈机制
- 支持更多 Simulcast 层级
- 添加网络模拟功能用于测试
- 实现带宽历史的持久化存储

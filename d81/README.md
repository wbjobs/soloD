# P2P 视频传输系统

基于 Node.js 和原生 Web 技术的点对点视频传输系统，使用 WebCodecs API 和 WebGL 进行视频解码和渲染。

## 功能特性

- ✅ **UDP 信令服务器**：基于 Node.js dgram 模块搭建
- ✅ **WebSocket 信令支持**：兼容浏览器环境
- ✅ **SDP 交换**：服务端转发 WebRTC 会话描述协议
- ✅ **WebRTC P2P 连接**：RTCPeerConnection 建立点对点连接
- ✅ **WebCodecs 解码**：VideoDecoder 手动解码 H.264 Annex B 流
- ✅ **WebGL 渲染**：YUV 到 RGB 色彩空间转换，硬件加速渲染
- ✅ **ICE 候选转发**：NAT 穿透支持
- ✅ **PLI/FIR 关键帧请求**：网络抖动时自动请求关键帧恢复
- ✅ **解码器错误恢复**：自动检测解码错误并重置解码器
- ✅ **帧连续性监控**：检测超时和连续 P 帧过多，自动触发恢复
- ✅ **手动恢复按钮**：用户可手动触发恢复流程

## 技术栈

**后端：**
- Node.js
- dgram (UDP)
- ws (WebSocket)
- HTTP 静态文件服务

**前端：**
- WebRTC (RTCPeerConnection)
- WebCodecs API (VideoDecoder)
- WebGL
- Canvas API
- MediaDevices API

## 安装运行

### 1. 安装依赖

```bash
npm install
```

### 2. 启动服务器

```bash
npm start
```

服务器将在以下端口运行：
- HTTP: http://localhost:3000
- WebSocket: ws://localhost:3000
- UDP: 0.0.0.0:5000

### 3. 使用说明

1. 打开两个浏览器窗口，都访问 http://localhost:3000
2. 第一个窗口输入用户ID `user1`，点击"注册"
3. 第二个窗口输入用户ID `user2`，点击"注册"
4. 在第一个窗口的"呼叫用户"输入 `user2`，点击"发起呼叫"
5. 连接建立后，双方可以看到彼此的视频画面

## 项目结构

```
.
├── server.js          # 服务器（UDP + WebSocket + HTTP）
├── package.json       # 项目配置
├── index.html         # 前端页面
├── udp-signaling.js   # 信令客户端
├── webgl-renderer.js  # WebGL YUV 渲染器
├── video-decoder.js   # WebCodecs 视频解码器
├── webrtc-manager.js  # WebRTC 连接管理器
└── app.js             # 主应用逻辑
```

## 核心模块说明

### 1. 信令服务器 (server.js)

- **UDP 服务器**：端口 5000，处理原生 UDP 客户端
- **WebSocket 服务器**：端口 3000，处理浏览器客户端
- **HTTP 服务器**：提供静态文件服务
- **消息转发**：SDP Offer/Answer、ICE 候选、用户列表

### 2. WebGL 渲染器 (webgl-renderer.js)

- 顶点着色器：处理纹理坐标映射
- 片段着色器：YUV 到 RGB 色彩空间转换
- 三纹理采样：Y、U、V 分别作为独立纹理
- 转换公式：
  ```
  R = Y + 1.13983 * V
  G = Y - 0.39465 * U - 0.58060 * V
  B = Y + 2.03211 * U
  ```

### 3. 视频解码器 (video-decoder.js)

- VideoDecoder 初始化和配置
- EncodedVideoChunk 解码处理
- Annex B NAL 单元解析
- 帧数据提取和渲染

### 4. WebRTC 管理器 (webrtc-manager.js)

- RTCPeerConnection 建立和管理
- createEncodedVideoStreams 原始帧提取
- ICE 候选收集和交换
- 媒体轨道处理
- **PLI/FIR 关键帧请求**：发送 RTCP 反馈请求关键帧
- **帧连续性监控**：检测帧超时和连续 P 帧
- **自动恢复流程**：重置解码器 + 请求关键帧 + 清空画布

### 5. 故障恢复机制

**触发条件**：
- 解码器连续 5 次错误
- 帧接收超时（3 秒）
- 连续 30 个 P 帧无关键帧
- 收到 P 帧但解码器未配置
- 用户手动点击恢复按钮

**恢复流程**：
1. 暂停新的帧处理
2. 重置 VideoDecoder 解码器
3. 清空 WebGL 画布为纯黑
4. 发送 PLI/FIR RTCP 反馈请求关键帧
5. 等待收到关键帧后重新配置解码器
6. 恢复正常帧处理

## 浏览器兼容性

- Chrome 94+
- Edge 94+
- Safari 15.4+ (部分支持)
- Firefox 支持中

**需要安全上下文（HTTPS 或 localhost）**

## 注意事项

1. **摄像头权限**：首次使用需要授权摄像头和麦克风访问
2. **网络环境**：建议在同一局域网内测试，公网需要 TURN 服务器
3. **浏览器版本**：确保使用支持 WebCodecs API 的现代浏览器
4. **编码格式**：系统默认使用 H.264 (avc1.42001E)

## 扩展建议

1. 添加 TURN 服务器支持以改进公网连接
2. 实现视频编码（VideoEncoder）支持自定义码率
3. 添加音频处理和静音检测
4. 实现数据通道用于文件传输
5. 添加录制功能
6. 实现屏幕共享
7. 添加美颜和滤镜效果

## 许可证

MIT

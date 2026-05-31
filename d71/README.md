# 实时视频会议应用

一个基于 WebRTC + Rust Wasm + Socket.IO 的实时视频会议应用，支持实时人像背景虚化。

## 技术栈

- **前端**: React 18 + Vite + WebRTC
- **核心处理**: Rust + WebAssembly (Wasm)
- **服务端**: Node.js + Express + Socket.IO

## 项目结构

```
d71/
├── rust-wasm/          # Rust Wasm 模块 - 背景虚化算法
│   ├── src/
│   │   └── lib.rs      # 核心算法实现
│   └── Cargo.toml
├── react-frontend/     # React 前端应用
│   ├── src/
│   │   ├── App.jsx     # 主组件
│   │   ├── main.jsx    # 入口文件
│   │   └── index.css   # 样式文件
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
└── node-server/        # Socket.IO 服务端
    ├── server.js       # 服务端主文件
    └── package.json
```

## 功能特性

1. **WebRTC 视频捕获**: 使用浏览器 WebRTC API 获取摄像头视频流
2. **Rust Wasm 背景虚化**: 使用基于皮肤检测的算法实现实时人像背景虚化
3. **Socket.IO 流转发**: 通过 Socket.IO 实时转发处理后的视频帧
4. **房间系统**: 支持多人同时加入同一视频会议房间
5. **实时 FPS 显示**: 显示视频处理帧率

## 安装和运行

### 前置要求

- Node.js >= 16
- Rust >= 1.70
- wasm-pack (`cargo install wasm-pack`)

### 步骤 1: 构建 Rust Wasm 模块

```bash
cd rust-wasm
wasm-pack build --target web
```

### 步骤 2: 安装并启动服务端

```bash
cd ../node-server
npm install
npm start
```

服务端将在 `http://localhost:3001` 运行

### 步骤 3: 安装并启动前端

```bash
cd ../react-frontend
npm install
npm run dev
```

前端将在 `http://localhost:3000` 运行

## 使用说明

1. 打开两个浏览器窗口，都访问 `http://localhost:3000`
2. 在两个窗口中都点击"启动摄像头"按钮
3. 在两个窗口中输入相同的房间 ID（如 room-1），点击"连接"
4. 点击"背景虚化"按钮开启实时背景虚化效果
5. 两个窗口可以互相看到对方的视频

## 背景虚化算法说明

该算法采用以下步骤：

1. **皮肤检测**: 使用 RGB 和 YCbCr 颜色空间检测人像皮肤区域
2. **形态学处理**:
   - 腐蚀操作: 去除噪点
   - 膨胀操作: 扩大检测区域
   - 平滑操作: 生成平滑的遮罩
3. **高斯模糊**: 对非人像区域应用 5x5 高斯模糊
4. **alpha 混合**: 将原图像与模糊后的背景根据遮罩进行混合

## 注意事项

- 皮肤检测算法对光线和肤色比较敏感，可能需要根据实际情况调整阈值
- 视频流通过 base64 编码的 JPEG 图像传输，适合小范围演示
- 生产环境建议使用 WebRTC P2P 或 SFU 架构
- 首次加载 Wasm 模块可能需要几秒钟

## 性能优化建议

1. 降低视频分辨率（当前 640x480）
2. 使用 SIMD 指令优化 Rust 代码
3. 实现 WebGL 加速的模糊算法
4. 使用更高效的人像分割模型（如 MediaPipe）

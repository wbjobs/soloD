# HEVC Intra Encoder (WebAssembly + React)

基于WebAssembly的H.265/HEVC帧内编码器，使用C++实现核心编码算法，React实现前端界面。

## 功能特性

- ✅ **35种帧内预测模式**：Planar模式、DC模式、33种角度模式
- ✅ **SATD代价函数**：使用哈达玛变换的SATD进行模式选择
- ✅ **CU递归划分**：支持从64x64到4x4的CU深度划分
- ✅ **多尺寸TU支持**：支持4x4到32x32的变换单元
- ✅ **HEVC Annex B码流格式**：标准的NALU码流封装
- ✅ **WebSocket实时传输**：编码后码流实时发送
- ✅ **FFmpeg视频解码**：使用FFmpeg.wasm解码源视频
- ✅ **实时统计**：帧率、比特率、数据量等实时显示

## 项目结构

```
├── wasm/                      # WebAssembly C++代码
│   ├── hevc_encoder.h        # 编码器C API定义
│   ├── hevc_encoder.cpp      # 编码器主实现 + Emscripten绑定
│   ├── intra_prediction.h    # 帧内预测类定义
│   ├── intra_prediction.cpp  # 帧内预测实现
│   ├── cu_encoder.h          # CU编码类定义
│   ├── cu_encoder.cpp        # CU递归划分实现
│   ├── bitstream_writer.h    # 码流写入类定义
│   ├── bitstream_writer.cpp  # NALU码流封装实现
│   └── Makefile              # Emscripten编译配置
├── src/                       # React前端代码
│   ├── utils/
│   │   ├── wasmEncoder.ts    # WASM编码器封装
│   │   ├── videoDecoder.ts   # FFmpeg视频解码
│   │   └── websocketStream.ts # WebSocket传输
│   ├── components/
│   │   └── VideoEncoder.tsx  # 主编码组件
│   ├── App.tsx
│   └── index.tsx
├── public/                    # 静态资源
│   └── index.html
├── server/                    # WebSocket测试服务器
│   └── ws-server.js          # 接收并保存码流
├── package.json
├── tsconfig.json
└── README.md
```

## 环境要求

- Node.js 18+
- Emscripten SDK (用于编译WASM)
- 现代浏览器 (支持WebAssembly和Web Worker)

## 编译与运行

### 1. 安装依赖

```bash
npm install
```

### 2. 编译WebAssembly模块

```bash
cd wasm
make
```

需要先安装Emscripten SDK：
```bash
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh
```

### 3. 启动WebSocket测试服务器

```bash
node server/ws-server.js
```

服务器运行在 `ws://localhost:8080`，接收的码流会保存到 `output/` 目录。

### 4. 启动React开发服务器

```bash
npm start
```

访问 `http://localhost:3000`

## 使用说明

1. **选择视频文件**：点击"Select Video File"选择要编码的视频
2. **设置QP值**：调整质量参数(0-51)，值越小质量越高
3. **配置WebSocket**：设置接收码流的WebSocket服务器地址
4. **开始编码**：点击"Start Encoding"开始编码
5. **实时查看**：在Statistics面板查看实时编码统计

## 编码算法说明

### 帧内预测模式

| 模式 | 类型 | 说明 |
|------|------|------|
| 0 | Planar | 平面预测，适用于平滑区域 |
| 1 | DC | DC预测，适用于均匀区域 |
| 2-34 | Angular | 33种角度预测，覆盖各个方向 |

### SATD代价计算

使用4x4哈达玛变换计算残差的绝对变换和，公式：
```
SATD = Σ|Hadamard(orig - pred)|
```

### CU递归划分

```
64x64
├─ 32x32 (深度1)
│  └─ 16x16 (深度2)
│     └─ 8x8 (深度3)
│        └─ 4x4 (深度4)
```

每个CU根据RD代价决定是否继续划分。

## 技术栈

- **前端**：React 18 + TypeScript
- **视频解码**：FFmpeg.wasm (@ffmpeg/ffmpeg)
- **编码器**：C++17 + Emscripten
- **传输**：WebSocket二进制协议
- **构建工具**：Create React App

## License

MIT

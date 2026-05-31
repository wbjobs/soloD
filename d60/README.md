# 语音翻译网关 (Voice Translation Gateway)

基于 Go + gRPC + WebSocket 的双向流式语音翻译网关，集成实时 VAD（语音活动检测）和静音裁剪模块。

## 功能特性

### 核心功能
- ✅ **双向流式传输**: gRPC + WebSocket 双协议支持
- ✅ **实时 VAD 检测**: WebRTC VAD 实现，支持动态调整灵敏度
- ✅ **静音裁剪**: 自动去除音频静音部分，优化识别效率
- ✅ **音频段序号管理**: 基于优先级队列，保证多段并行处理顺序正确
- ✅ **乱序重排**: 超时机制 + 强制刷新，确保结果有序输出

### ASR 引擎支持
- ✅ **PaddleSpeech (飞桨)**: 百度开源语音识别引擎
- ✅ **FunASR**: 阿里达摩院开源语音识别工具包

### MT 引擎支持
- ✅ **Google Translate**: Google 翻译 API
- ✅ **DeepL**: 高质量机器翻译 API

## 项目结构

```
d60/
├── api/
│   └── proto/
│       └── translation.proto    # gRPC 协议定义
├── cmd/
│   └── server/
│       └── main.go             # 服务入口
├── internal/
│   ├── vad/
│   │   └── vad.go              # VAD 检测和静音裁剪模块
│   ├── audio/
│   │   └── sequencer.go        # 音频段序号管理和乱序重排
│   ├── asr/
│   │   └── client.go           # ASR 客户端接口 (Paddle/FunASR)
│   ├── mt/
│   │   └── client.go           # MT 客户端接口 (Google/DeepL)
│   ├── grpc/
│   │   └── server.go           # gRPC 服务实现
│   └── websocket/
│       └── server.go           # WebSocket 服务实现
├── pkg/
│   └── config/
│       └── config.go           # 配置管理
├── web/
│   └── index.html              # 前端 Web 客户端
├── config.yaml                 # 配置文件
└── go.mod                      # Go 模块定义
```

## 核心模块说明

### 1. VAD 模块 (`internal/vad/vad.go`)

**VAD 状态机**:
- `SILENCE`: 静音状态
- `SPEECH_START`: 检测到语音开始
- `SPEECH_ONGOING`: 语音持续中
- `SPEECH_END`: 语音结束

**可配置参数**:
- `aggressiveness`: VAD 灵敏度 (0-3)，默认为 2
- `silence_duration_ms`: 静音切割时长，默认 300ms
- `threshold`: 能量阈值，默认 0.5
- `sample_rate`: 采样率，默认 16000Hz

### 2. 序号管理器 (`internal/audio/sequencer.go`)

**核心特性**:
- 基于最小堆（优先级队列）实现结果排序
- 超时机制：超时的结果强制输出
- 队列大小限制：超过阈值强制 flush
- 支持多段并行处理，保证结果按正确顺序输出

### 3. WebSocket 服务 (`internal/websocket/server.go`)

**消息类型**:
- `audio`: 音频帧数据（PCM 16bit 16kHz）
- `config`: 会话配置（源语言、目标语言、引擎选择等）
- `control`: 控制命令（start/stop/flush）

### 4. gRPC 服务 (`internal/grpc/server.go`)

**服务定义**:
```protobuf
service TranslationService {
  rpc StreamTranslate(stream TranslateRequest) returns (stream TranslateResponse);
  rpc ConfigureVAD(VADConfigRequest) returns (VADConfigResponse);
}
```

## 配置说明

```yaml
server:
  http_addr: ":8080"          # HTTP/WebSocket 监听地址
  grpc_addr: ":50051"         # gRPC 监听地址
  websocket_path: "/ws"       # WebSocket 端点路径

vad:
  aggressiveness: 2           # VAD 灵敏度
  silence_duration_ms: 300    # 静音切割时长
  threshold: 0.5              # 能量阈值
  sample_rate: 16000          # 采样率

asr:
  provider: "funasr"          # 默认 ASR 引擎
  paddleasr:
    api_endpoint: "http://localhost:8090/paddlespeech/asr"
    api_key: ""
  funasr:
    api_endpoint: "http://localhost:10095/recognition"

mt:
  provider: "google"           # 默认 MT 引擎
  google_translate:
    api_key: ""
  deepl:
    api_key: ""
    base_url: "https://api-free.deepl.com/v2"
```

## 快速开始

### 前置要求
- Go 1.21+
- 可选：PaddleSpeech 或 FunASR 服务
- 可选：Google Translate 或 DeepL API Key

### 启动服务

```bash
# 安装依赖
go mod tidy

# 启动服务
go run cmd/server/main.go
```

### 访问 Web 客户端

打开浏览器访问: `http://localhost:8080`

## 工作流程

```
客户端 (WebSocket)
    ↓
发送音频流 (20ms 帧)
    ↓
┌─────────────────────────────────┐
│   VAD 检测模块                   │
│   ├─ 检测语音开始/结束           │
│   └─ 静音裁剪                    │
└─────────────────────────────────┘
    ↓
切割为语音段 (Segment)
    ↓
┌─────────────────────────────────┐
│   ASR 客户端                    │
│   ├─ PaddleSpeech               │
│   └─ FunASR                     │
└─────────────────────────────────┘
    ↓
识别文本结果
    ↓
┌─────────────────────────────────┐
│   MT 客户端                     │
│   ├─ Google Translate           │
│   └─ DeepL                      │
└─────────────────────────────────┘
    ↓
翻译结果
    ↓
┌─────────────────────────────────┐
│   序号管理器 (Sequencer)        │
│   ├─ 优先级队列                 │
│   ├─ 超时机制                   │
│   └─ 乱序重排                   │
└─────────────────────────────────┘
    ↓
流式推送至客户端
```

## 协议说明

### WebSocket 消息格式

**客户端发送**:
```json
{
  "type": "audio|config|control",
  "payload": {}
}
```

**服务端响应**:
```json
{
  "type": "transcript|translation|vadStatus|error",
  "payload": {}
}
```

### gRPC 流式消息

详见 `api/proto/translation.proto`

## 扩展性设计

### 添加新的 ASR 引擎
1. 实现 `ASRClient` 接口
2. 在工厂中注册新引擎
3. 更新配置文件

### 添加新的 MT 引擎
1. 实现 `MTClient` 接口
2. 在工厂中注册新引擎
3. 更新配置文件

## 技术栈

- **语言**: Go 1.21+
- **网络框架**: gRPC, Gorilla WebSocket
- **配置**: Viper
- **VAD**: WebRTC VAD (能量检测实现)
- **前端**: 原生 HTML5 + Web Audio API

## 注意事项

1. 生产环境建议配置真实的 ASR 和 MT 服务
2. 音频格式建议使用 16kHz 16bit PCM 单声道
3. WebSocket 消息大小限制：建议 1MB
4. 并发连接数根据服务器资源调整

## License

MIT License

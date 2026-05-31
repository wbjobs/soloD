# 音频处理Web应用

一个集成了实时频谱可视化和音频降噪功能的Web应用。

## 技术栈

- **前端**: React + WebAssembly (Rust)
- **后端**: FastAPI
- **音频处理**: FFmpeg
- **认证**: JWT
- **任务队列**: Celery + Redis

## 功能特性

1. 实时音频频谱可视化（WebAssembly）
2. 音频降噪处理（FFmpeg）
3. 用户认证系统
4. 任务队列管理

## 项目结构

```
audio-processing-app/
├── frontend/          # React前端
├── wasm-audio/        # Rust WebAssembly模块
└── backend/           # FastAPI后端
```

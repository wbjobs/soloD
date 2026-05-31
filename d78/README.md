# 🎯 手势 PPT 控制系统

基于 TensorFlow.js 和 FastAPI 的手势识别 PPT 控制系统，使用摄像头实时检测手势，通过 WebSocket 发送指令控制 PowerPoint 翻页。

## ✨ 功能特性

- 🔍 **实时手势识别**：使用 TensorFlow.js HandPose 模型识别手部关键点
- ✊ **握拳手势**：控制 PPT 切换到下一页
- 🖐️ **张开手掌手势**：控制 PPT 切换到上一页
- 🌐 **WebSocket 通信**：前后端实时通信，延迟低
- 🎨 **美观的前端界面**：现代化 UI，实时显示手势状态和连接状态
- 💻 **Windows 原生支持**：通过 COM API 直接控制 PowerPoint

## 📁 项目结构

```
d78/
├── frontend/
│   ├── index.html      # 前端页面
│   └── app.js          # 手势检测和 WebSocket 逻辑
└── backend/
    ├── main.py         # FastAPI 服务和 PowerPoint 控制
    └── requirements.txt # Python 依赖
```

## 🚀 快速开始

### 环境要求

- Windows 系统（用于 PowerPoint 控制）
- Python 3.8+
- 现代浏览器（Chrome/Edge/Firefox，支持 WebRTC 和 WebSocket）
- 摄像头设备
- Microsoft PowerPoint

### 后端安装

1. 进入后端目录：
```bash
cd backend
```

2. 创建虚拟环境（推荐）：
```bash
python -m venv venv
venv\Scripts\activate
```

3. 安装依赖：
```bash
pip install -r requirements.txt
```

4. 启动后端服务：
```bash
python main.py
```

后端服务将在 `http://localhost:8000` 启动

### 前端使用

1. 打开浏览器，直接打开 `frontend/index.html` 文件

或者使用简单的 HTTP 服务器：
```bash
cd frontend
python -m http.server 3000
```

然后在浏览器中访问 `http://localhost:3000`

## 📖 使用说明

### 步骤 1：准备 PowerPoint

1. 打开 PowerPoint 软件
2. 打开你要演示的 PPT 文件
3. 按 F5 进入幻灯片放映模式

### 步骤 2：启动前端

1. 在浏览器中打开前端页面
2. 等待 HandPose 模型加载完成（约 5-10 秒）
3. 点击「开始手势检测」按钮
4. 允许浏览器访问摄像头权限

### 步骤 3：连接后端

1. 点击「连接到后端」按钮建立 WebSocket 连接
2. 确认连接状态显示「已连接」

### 步骤 4：手势控制

- **✊ 握拳**：保持握拳姿势 1 秒以上 → PPT 下一页
- **🖐️ 张开手掌**：保持张开姿势 1 秒以上 → PPT 上一页

> 💡 **提示**：手势需要保持稳定 1 秒才会触发，避免误操作；触发后有 1.5 秒冷却时间

## 🔧 API 接口

### WebSocket 端点

- `ws://localhost:8000/ws`：WebSocket 连接端点

### HTTP 端点

- `GET /`：API 信息
- `GET /health`：健康检查
- `POST /ppt/next`：手动下一页
- `POST /ppt/prev`：手动上一页

## 🎯 手势识别原理

系统通过 HandPose 模型检测 21 个手部关键点，然后：

1. 计算各手指指尖到关节的距离
2. 判断手指是否弯曲（折叠）
3. 综合 4 根手指和拇指的状态：
   - 3 根以上手指折叠 + 拇指折叠 → 握拳（fist）
   - 1 根以下手指折叠 → 张开手掌（open）

## ⚙️ 技术栈

### 前端

- **TensorFlow.js**：机器学习框架
- **MediaPipe Hands**：手部关键点检测模型
- **HTML5 Canvas**：视频和关键点绘制
- **WebSocket**：实时通信

### 后端

- **FastAPI**：现代 Python Web 框架
- **pywin32 (win32com)**：Windows COM API 调用
- **Uvicorn**：ASGI 服务器

## 🐛 常见问题

**Q: 模型加载很慢？**
A: 首次加载需要下载模型文件（约 10MB），请耐心等待。后续加载会使用缓存。

**Q: 手势识别不准确？**
A: 确保：
- 光线充足
- 手掌在摄像头中央
- 手势清晰分明（握拳要握紧，张开要完全展开）

**Q: PowerPoint 没反应？**
A: 检查：
- PowerPoint 是否已打开
- 是否进入了幻灯片放映模式（F5）
- WebSocket 是否已连接
- 后端服务是否正常运行

**Q: 摄像头无法打开？**
A: 确保浏览器有摄像头权限，并且没有其他程序占用摄像头。

## 📝 注意事项

- 仅支持 Windows 系统的 PowerPoint 控制
- 浏览器需要 HTTPS 或 localhost 才能访问摄像头
- 手势检测需要一定的计算资源，建议使用性能较好的设备
- 为了隐私安全，请仅在可信环境中使用

## 📄 许可证

MIT License

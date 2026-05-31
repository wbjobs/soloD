# 💰 财务票据识别系统

智能发票OCR识别系统，采用"本地优先，云端增强"的双引擎架构。

## ✨ 特性

- **🔤 本地优先**: 使用 Tesseract.js 在浏览器端进行OCR识别，保护数据隐私
- **🚀 云端增强**: 当本地识别置信度低于 80% 时，自动上传至后端使用 PaddleOCR 进行高精度识别
- **📊 置信度可视化**: 实时显示识别置信度，直观了解识别质量
- **📋 结果导出**: 支持复制文本和导出JSON格式
- **🎯 拖拽上传**: 支持点击和拖拽两种上传方式
- **📱 响应式设计**: 适配各种屏幕尺寸

## 📁 项目结构

```
d40/
├── backend/                 # 后端服务
│   ├── requirements.txt     # Python依赖
│   └── main.py             # FastAPI主程序
└── frontend/               # 前端应用
    ├── package.json        # Node依赖
    ├── vite.config.js      # Vite配置
    ├── index.html          # HTML入口
    └── src/
        ├── main.js         # Vue入口
        ├── style.css       # 全局样式
        └── App.vue         # 主组件
```

## 🚀 快速开始

### 前置要求

- Python 3.8+
- Node.js 16+
- pip (Python包管理器)

### 后端安装与运行

1. 进入后端目录：
```bash
cd backend
```

2. 创建虚拟环境（推荐）：
```bash
python -m venv venv
# Windows
venv\Scripts\activate
# Linux/Mac
source venv/bin/activate
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

### 前端安装与运行

1. 进入前端目录（新开一个终端）：
```bash
cd frontend
```

2. 安装依赖：
```bash
npm install
```

3. 启动开发服务器：
```bash
npm run dev
```

前端应用将在 `http://localhost:3000` 启动

### 访问应用

打开浏览器访问 `http://localhost:3000` 即可使用。

## 🛠️ 技术栈

### 前端
- **Vue 3**: 渐进式JavaScript框架
- **Vite**: 下一代前端构建工具
- **Tesseract.js**: 浏览器端OCR识别库
- **Axios**: HTTP客户端

### 后端
- **FastAPI**: 现代、快速的Python Web框架
- **PaddleOCR**: 百度开源的超轻量级OCR工具库
- **Pillow**: Python图像处理库
- **Uvicorn**: ASGI服务器

## 📝 API接口

### 健康检查
```
GET /api/health
```

响应示例：
```json
{
  "status": "ok",
  "service": "invoice-ocr-backend"
}
```

### OCR识别
```
POST /api/ocr
Content-Type: multipart/form-data
```

参数：
- `file`: 图片文件

响应示例：
```json
{
  "success": true,
  "results": [
    {
      "text": "识别的文字",
      "confidence": 0.95,
      "bbox": [[0, 0], [100, 0], [100, 30], [0, 30]]
    }
  ],
  "engine": "paddleocr"
}
```

## ⚙️ 配置说明

### 置信度阈值

在 `frontend/src/App.vue` 中修改：
```javascript
const CONFIDENCE_THRESHOLD = 0.8  // 默认0.8（80%）
```

### 后端端口

在 `backend/main.py` 中修改：
```python
uvicorn.run(app, host="0.0.0.0", port=8000)
```

### 前端代理

在 `frontend/vite.config.js` 中修改后端地址。

## 🎯 使用流程

1. 上传发票图片（点击或拖拽）
2. 系统自动使用 Tesseract.js 进行本地识别
3. 显示识别进度和置信度
4. 如果平均置信度 ≥ 80%，直接显示结果
5. 如果平均置信度 < 80%，自动上传至后端使用 PaddleOCR 重新识别
6. 查看识别结果，可复制或导出

## 📊 导出功能说明

### Excel导出功能会生成包含两个工作表的Excel文件：

**工作表1 - 票据识别结果**
| 列名 | 说明 |
|------|------|
| 序号 | 识别结果的行号 |
| 识别文本 | OCR识别出的文本内容 |
| 置信度 | 百分比格式的置信度（如 95.5%） |
| 置信度数值 | 原始数值格式的置信度（便于排序和计算） |
| 识别引擎 | Tesseract.js（本地）或 PaddleOCR（云端） |
| 识别时间 | 识别完成的时间戳 |
| 文件名 | 上传的图片文件名 |

**工作表2 - 识别统计**
| 统计项 | 数值 |
|--------|------|
| 识别总条数 | 本次识别的文本行数 |
| 平均置信度 | 所有识别结果的平均置信度 |
| 识别引擎 | 使用的OCR引擎 |
| 导出时间 | Excel文件导出的时间戳 |

## 📦 生产构建

### 前端构建
```bash
cd frontend
npm run build
```

构建产物将生成在 `dist` 目录。

### 后端部署
使用 Gunicorn 或其他 WSGI 服务器部署：
```bash
pip install gunicorn
gunicorn main:app -w 4 -k uvicorn.workers.UvicornWorker -b 0.0.0.0:8000
```

## ⚠️ 注意事项

1. **首次运行**: PaddleOCR 首次运行时会自动下载模型文件，请保持网络连接
2. **内存占用**: PaddleOCR 内存占用较大，建议服务器至少有 4GB 内存
3. **语言支持**: 当前配置支持中文和英文识别
4. **网络要求**: 本地识别无需网络，云端识别需要前后端网络连通

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

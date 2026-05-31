# 工业智能质检系统

基于Vue3 + TensorFlow.js + Flask + YOLOv8的工业质检Web应用，实现浏览器端实时缺陷初筛和后端高精度复核。

## 系统架构

```
┌─────────────────────────────────────────┐
│           前端 (Vue3 + TensorFlow.js)    │
│  ┌───────────────────────────────────┐  │
│  │  摄像头实时采集  →  图像预处理     │  │
│  │  →  异常检测  →  疑似缺陷标记      │  │
│  └───────────────────────────────────┘  │
└────────────────────┬────────────────────┘
                     │ HTTP
                     ▼
┌─────────────────────────────────────────┐
│        后端 (Flask + YOLOv8 + PostgreSQL) │
│  ┌───────────────────────────────────┐  │
│  │  接收图片  →  YOLO高精度检测      │  │
│  │  →  结果存储  →  返回检测结果      │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## 功能特性

### 前端功能
- 📷 浏览器摄像头实时采集
- ⚡ TensorFlow.js图像预处理与异常检测
- 🚨 疑似缺陷自动标记与抓拍
- 📊 检测统计与历史记录展示
- 🔄 后端健康状态实时监控

### 后端功能
- 🎯 YOLOv8高精度缺陷检测
- 💾 PostgreSQL数据持久化
- 🔍 RESTful API接口
- 📁 图片文件存储管理

## 快速开始

### 环境要求
- Node.js 16+
- Python 3.8+
- PostgreSQL 12+

### 1. 数据库配置

创建数据库和表：

```sql
CREATE DATABASE industrial_inspection;
```

修改 `backend/.env` 文件中的数据库配置：

```env
DB_NAME=industrial_inspection
DB_USER=postgres
DB_PASSWORD=your_password
DB_HOST=localhost
DB_PORT=5432
```

### 2. 后端部署

```bash
cd backend

# 创建虚拟环境
python -m venv venv
venv\Scripts\activate  # Windows

# 安装依赖
pip install -r requirements.txt

# 启动服务
python app.py
```

后端服务将在 `http://localhost:5000` 启动。

> **说明**: 首次运行会自动创建数据库表，并下载YOLOv8n模型（约6MB）。如果有训练好的自定义模型，可将 `best.pt` 放入 `models/` 目录。

### 3. 前端部署

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

前端服务将在 `http://localhost:3000` 启动。

### 4. 访问应用

打开浏览器访问 `http://localhost:3000`

## API接口文档

### 健康检查
```
GET /api/health
响应: { status: "healthy", timestamp: "..." }
```

### 提交检测
```
POST /api/inspect
Content-Type: multipart/form-data
参数:
  - image: 图片文件
  - frontend_result: 前端检测结果 (suspicious/normal)

响应: {
  id: 1,
  image_path: "...",
  frontend_result: "suspicious",
  backend_result: "defective",
  defect_type: "scratch",
  confidence: 0.95,
  timestamp: "..."
}
```

### 获取检测记录
```
GET /api/inspections
响应: [
  { id: 1, ... },
  ...
]
```

## 目录结构

```
industrial-inspection/
├── backend/
│   ├── app.py                 # Flask主应用
│   ├── requirements.txt       # Python依赖
│   └── .env                   # 环境变量
├── frontend/
│   ├── src/
│   │   ├── App.vue           # 主应用组件
│   │   ├── main.js           # 入口文件
│   │   ├── components/
│   │   │   ├── CameraComponent.vue    # 摄像头组件
│   │   │   └── ResultPanel.vue        # 结果面板
│   │   └── utils/
│   │       └── api.js        # API工具函数
│   ├── package.json
│   └── vite.config.js
├── models/                    # YOLO模型存储目录
├── uploads/                   # 上传图片存储目录
└── README.md
```

## 自定义模型训练

如需使用自定义YOLO模型：

1. 按照YOLOv8官方文档训练自定义模型
2. 将训练好的 `best.pt` 文件放入 `models/` 目录
3. 重启后端服务，系统会自动加载自定义模型

## 注意事项

1. **HTTPS要求**: 摄像头访问需要HTTPS环境（localhost除外）
2. **浏览器权限**: 首次使用需要授予摄像头访问权限
3. **模型优化**: 生产环境建议使用TensorRT或ONNX优化模型
4. **并发处理**: 高并发场景建议添加任务队列（如Celery）

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 前端框架 | Vue.js | 3.x |
| 前端UI | Element Plus | 2.x |
| 深度学习前端 | TensorFlow.js | 4.x |
| 后端框架 | Flask | 2.3.x |
| 深度学习后端 | YOLOv8 (Ultralytics) | 8.x |
| 数据库 | PostgreSQL | 12+ |
| 构建工具 | Vite | 4.x |

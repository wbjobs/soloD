# 气象粒子系统 - 全栈应用

基于 Three.js 和 FastAPI 的实时气象粒子可视化系统。

## 项目结构

```
d21/
├── backend/                 # FastAPI 后端
│   ├── main.py             # API 和 WebSocket 服务
│   ├── data_generator.py   # 气象数据生成器
│   └── requirements.txt    # Python 依赖
└── frontend/               # Three.js 前端
    ├── src/
    │   ├── main.js         # 应用入口
    │   ├── scene.js        # Three.js 场景管理
    │   └── websocket.js    # WebSocket 客户端
    ├── index.html          # HTML 页面
    ├── package.json        # Node.js 依赖
    └── vite.config.js      # Vite 配置
```

## 功能特性

### 后端
- ✅ 3个气象站点的模拟数据（北京、上海、广州）
- ✅ 每200ms更新一次实时数据
- ✅ WebSocket 实时推送
- ✅ REST API 接口
- ✅ CORS 跨域支持

### 前端
- ✅ Three.js 3D 粒子系统（2000个粒子）
- ✅ 粒子运动受风速、风向影响
- ✅ 鼠标拖拽旋转视角（OrbitControls）
- ✅ 滚轮缩放
- ✅ 点击粒子显示详细信息
- ✅ 实时数据面板显示
- ✅ WebSocket 自动重连

## 快速开始

### 方式一：分步启动

1. **启动后端服务**
```bash
cd backend
python -m venv venv
venv\Scripts\activate  # Windows
pip install -r requirements.txt
uvicorn main:app --reload
```
后端运行在: http://localhost:8000

2. **启动前端服务**
```bash
cd frontend
npm install
npm run dev
```
前端运行在: http://localhost:3000

### 方式二：使用启动脚本（Windows）
```bash
start.bat
```

## API 接口

- `GET /` - 服务状态
- `GET /api/stations` - 获取所有气象站数据
- `GET /api/station/{station_id}` - 获取单个气象站数据
- `WebSocket /ws/weather` - WebSocket 实时数据推送

## 使用说明

1. 打开浏览器访问 http://localhost:3000
2. 鼠标拖拽旋转3D场景
3. 滚轮放大/缩小
4. 点击粒子或气象站标记查看详情
5. 左侧面板显示实时气象数据
6. 顶部指示灯显示 WebSocket 连接状态

## 技术栈

- **后端**: FastAPI, WebSocket, Python
- **前端**: Three.js, Vite, JavaScript
- **3D控制**: OrbitControls
- **粒子系统**: BufferGeometry + PointsMaterial

# Modbus TCP 实时监控系统

## 项目简介

这是一个完整的 Modbus TCP 监控系统，包含后端 Node.js 服务器和前端 Vue.js 仪表盘，用于实时监控温度和压力数据。

## 系统架构

- **后端**: Node.js + Express + WebSocket + modbus-serial
- **前端**: Vue 3 + Vite + ECharts
- **通信**: Modbus TCP 协议（端口 502）

## 功能特性

- 📊 实时仪表盘显示温度和压力
- 📈 历史数据趋势图表
- 🔄 WebSocket 实时数据推送
- 📋 最近数据记录表格
- 🎨 现代化深色主题UI
- 🔌 Modbus TCP 从机模拟器

## 快速开始

### 1. 安装依赖

#### 后端依赖
```bash
cd backend
npm install
```

#### 前端依赖
```bash
cd frontend
npm install
```

### 2. 启动服务

#### 启动 Modbus TCP 从机模拟器（终端1）
```bash
cd backend
node modbus-slave.js
```

#### 启动后端服务器（终端2）
```bash
cd backend
node server.js
```

#### 启动前端开发服务器（终端3）
```bash
cd frontend
npm run dev
```

### 3. 访问应用

在浏览器中打开: http://localhost:5173

## Modbus 寄存器映射

| 寄存器地址 | 说明 | 缩放因子 | 单位 |
|-----------|------|---------|------|
| 0 | 温度 | x10 | °C |
| 2 | 压力 | x100 | MPa |

## 项目结构

```
d48/
├── backend/
│   ├── package.json      # 后端依赖配置
│   ├── server.js         # 主服务器文件
│   └── modbus-slave.js   # Modbus从机模拟器
├── frontend/
│   ├── package.json      # 前端依赖配置
│   ├── vite.config.js    # Vite配置
│   ├── index.html        # HTML入口
│   └── src/
│       ├── main.js       # Vue应用入口
│       ├── App.vue       # 主组件
│       └── style.css     # 全局样式
└── README.md             # 说明文档
```

## API 接口

### 获取连接状态
```
GET /api/status
```

### 获取当前数据
```
GET /api/data
```

### WebSocket 实时数据
```
WS ws://localhost:3000
```

数据格式:
```json
{
  "temperature": 25.5,
  "pressure": 101.32,
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

## 注意事项

1. 需要先启动 Modbus 从机模拟器，再启动主服务器
2. 端口 502（Modbus）、3000（后端）、5173（前端）需要空闲
3. Windows系统可能需要管理员权限才能绑定端口502

## 技术栈

### 后端
- Node.js
- Express.js
- WebSocket (ws)
- modbus-serial

### 前端
- Vue 3 (Composition API)
- Vite
- ECharts

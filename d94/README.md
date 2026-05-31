# Social Graph - 社交媒体关系图谱工具

一个基于 **Go** + **Vue 3** + **D3.js** 的社交媒体关系图谱可视化工具。

## ✨ 功能特性

- 🐦 **Twitter** / 🐙 **GitHub** 双平台支持
- 🕸️ **D3.js** 力导向图可视化
- 🔍 可调节的深度搜索（1-3层）
- 📊 实时统计信息展示
- 🖱️ 节点拖拽、缩放、点击交互
- 🎨 深色科技风格UI
- 📱 响应式布局

## 🏗️ 技术栈

### 后端
- **Go 1.21+**
- **Gin** - Web 框架
- **CORS** - 跨域支持

### 前端
- **Vue 3** (Composition API)
- **Vite** - 构建工具
- **D3.js v7** - 数据可视化
- **Axios** - HTTP 客户端

## 📁 项目结构

```
social-graph/
├── backend/                 # Go 后端
│   ├── main.go             # 主入口
│   ├── go.mod              # 依赖管理
│   ├── handler/            # API 处理器
│   │   └── graph.go
│   └── model/              # 数据模型
│       └── graph.go
└── frontend/               # Vue 前端
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.js
        ├── App.vue
        ├── style.css
        ├── api/            # API 调用
        │   └── graph.js
        └── components/     # 组件
            ├── Graph.vue       # 力导向图
            ├── ControlPanel.vue # 控制面板
            └── InfoPanel.vue    # 信息面板
```

## 🚀 快速开始

### 1. 启动后端

```bash
cd backend
go mod download
go run main.go
```

后端将在 `http://localhost:8080` 启动

### 2. 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端将在 `http://localhost:5173` 启动

### 3. 开始使用

1. 选择平台（Twitter / GitHub）
2. 输入用户名
3. 选择深度（1-3）
4. 点击「生成图谱」
5. 探索社交网络！

## 🔌 API 接口

### 健康检查
```
GET /api/health
```

响应：
```json
{
  "status": "ok",
  "message": "Social Graph API is running"
}
```

### 获取关系图谱
```
POST /api/graph/fetch
Content-Type: application/json

{
  "platform": "twitter",
  "username": "elonmusk",
  "depth": 2
}
```

响应：
```json
{
  "nodes": [
    {
      "id": "elonmusk",
      "username": "elonmusk",
      "followers": 150000000,
      "following": 1100,
      "group": 0
    }
  ],
  "links": [
    {
      "source": "elonmusk",
      "target": "BillGates",
      "value": 1
    }
  ],
  "metadata": {
    "platform": "twitter",
    "rootUser": "elonmusk",
    "nodeCount": 25,
    "linkCount": 40
  }
}
```

## 🎮 交互说明

- **拖拽节点**: 可将节点拖到任意位置
- **缩放**: 鼠标滚轮可缩放整个图谱
- **点击节点**: 查看节点详细信息
- **悬停节点**: 节点会放大并增强发光效果

## 🎨 图例说明

- 🟠 **橙色**: 根节点（搜索的用户）
- 🔵 **青色**: 一级关注（直接关注）
- 🟣 **紫色**: 二级关注
- 🟢 **青色**: 三级关注

## 📝 注意事项

- 当前版本使用模拟数据
- 深度越大，节点数量越多，性能消耗越大
- 建议深度设置为 2 以获得最佳体验

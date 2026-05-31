# 体素编辑器 - Voxel Editor

基于 Three.js 和 Cannon.js 的 3D 体素编辑器，支持物理碰撞和数据持久化。

## 功能特性

- ✏️ **编辑功能**：左键放置方块，右键破坏方块
- 🎨 **多种颜色**：6 种颜色可选
- 🌍 **物理引擎**：方块掉落、碰撞检测
- ⚡ **渲染优化**：InstancedMesh 批量渲染，支持 1000+ 方块 60FPS
- 💾 **数据持久化**：MongoDB 存储场景数据
- 📂 **场景管理**：保存、加载、删除场景
- 🏔️ **程序化地形**：一键生成随机地形

## 项目结构

```
d74/
├── index.html              # 前端入口
├── style.css               # 样式文件
├── src/
│   ├── main.js           # 主程序（Three.js 渲染）
│   ├── physics.worker.js # 物理引擎 Worker
│   └── VoxelWorld.js     # 体素世界模块
└── server/
    ├── server.js         # Express 后端服务器
    ├── models/
    │   └── VoxelScene.js # MongoDB 数据模型
    └── package.json      # 后端依赖
```

## 环境要求

- Node.js >= 14.0+
- MongoDB >= 4.0+

## 启动步骤

### 1. 启动 MongoDB

确保 MongoDB 已安装并运行在默认端口 27017

**Windows (PowerShell):**
```powershell
# 如果 MongoDB 已安装为服务
net start MongoDB

# 或者使用 Docker
mongod
```

### 2. 安装后端依赖并启动

```powershell
cd server
npm install
npm start
```

后端服务器将运行在 `http://localhost:3001`

### 3. 启动前端服务器

在新的终端窗口中：

```powershell
# 回到项目根目录
cd ..
# 启动静态文件服务器
npx serve . -p 3000
```

前端页面将运行在 `http://localhost:3000`

## API 接口

### 保存场景
```
POST /api/scenes
Content-Type: application/json

{
  "name": "我的场景",
  "voxels": [
    {"x": 0, "y": 0, "z": 0, "color": "#e74c3c", "isStatic": true}
  ]
}
```

### 获取最新场景
```
GET /api/scenes/latest
```

### 获取所有场景列表
```
GET /api/scenes
```

### 获取指定场景
```
GET /api/scenes/:id
```

### 删除场景
```
DELETE /api/scenes/:id
```

## 使用说明

1. **放置方块**：鼠标左键点击已有的方块面
2. **破坏方块**：鼠标右键点击方块
3. **生成地形**：点击「生成地形」按钮
4. **保存场景**：输入场景名称，点击「💾 保存场景」
5. **加载场景**：点击「📂 加载场景」，选择要加载的场景
6. **删除场景**：在场景列表中点击「删除」按钮

## 技术栈

- **前端**：Three.js (WebGL)
- **物理**：Cannon.js (Worker 中运行)
- **后端**：Node.js + Express
- **数据库**：MongoDB + Mongoose

## 性能优化

- 使用 InstancedMesh 批量渲染方块
- 物理计算在 Web Worker 中独立运行
- 刚体休眠机制减少计算量
- 最大支持 10000+ 实例


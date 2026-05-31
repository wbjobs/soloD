# 三维城市热力图与路径规划系统

基于 Three.js + WebGL + Express + PostgreSQL 开发的三维城市可视化系统。

## 功能特性

### 后端功能
- **POI数据管理**: 城市兴趣点(POI)的存储和查询接口
- **路径规划**: 基于Dijkstra算法的多权重路径规划（最短/最快/风景路线）
- **热力图数据**: 热力图数据的聚合和按时间维度查询

### 前端功能
- **三维城市渲染**: 使用Three.js渲染逼真的三维城市模型
- **LOD细节层次**: 根据距离自动切换不同精度的模型
- **视锥体剔除**: 根据渲染距离动态隐藏远处物体
- **热力图叠加**: 支持城市热力图可视化，可按时间维度切换
- **热力图时间轴动画**: 播放24小时热力变化动画，支持多种播放速度
- **多方案路径规划可视化**: 同时显示最短/最快/风景三条路线，可一键切换
- **3D管道路径**: 使用TubeGeometry渲染真实的3D路径，避免穿模
- **性能统计面板**: 实时显示FPS、三角形数量、Draw Call、可见建筑数
- **交互控制**: 鼠标拖拽旋转、右键平移、滚轮缩放

## 项目结构

```
d6/
├── backend/                 # 后端服务
│   ├── src/
│   │   ├── config/         # 数据库配置
│   │   ├── routes/         # API路由
│   │   ├── scripts/        # 数据库初始化脚本
│   │   └── server.js       # 服务器入口
│   ├── package.json
│   └── .env
├── frontend/               # 前端应用
│   ├── index.html          # HTML入口
│   └── app.js              # Three.js应用主文件
└── README.md
```

## 技术栈

### 后端
- **Node.js + Express**: Web服务器框架
- **PostgreSQL**: 关系型数据库
- **pg**: PostgreSQL Node.js驱动

### 前端
- **Three.js**: 3D图形库
- **WebGL**: 图形渲染API
- **原生JavaScript**: 无需额外框架

## 安装与运行

### 前置要求
- Node.js >= 14.0
- PostgreSQL >= 12.0

### 后端安装

```bash
cd backend
npm install
```

### 数据库配置

1. 创建 PostgreSQL 数据库
2. 编辑 `backend/.env` 文件，配置数据库连接信息：

```env
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=city3d
DB_USER=postgres
DB_PASSWORD=your_password
```

### 初始化数据库

```bash
# 创建数据表
npm run init-db

# 插入测试数据
npm run seed-data
```

### 启动后端服务

```bash
# 开发模式（需要nodemon）
npm run dev

# 生产模式
npm start
```

### 前端运行

直接在浏览器中打开 `frontend/index.html` 文件即可。

或者使用本地HTTP服务器：

```bash
cd frontend
npx serve -p 8080
```

然后访问 `http://localhost:8080`

## API接口文档

### POI接口

- **GET /api/pois**: 获取所有POI列表
- **GET /api/pois/:id**: 获取单个POI详情
- **POST /api/pois**: 创建新的POI

### 路径规划接口

- **POST /api/pathfinding/find**: 查找两点间最短路径
  - 请求体: `{ startId: number, endId: number }`
  - 返回: `{ path: Array, distance: number }`

- **GET /api/pathfinding/roads**: 获取所有道路数据

### 热力图接口

- **GET /api/heatmap**: 获取热力图数据（支持时间过滤）
  - 参数: startTime, endTime, granularity
- **GET /api/heatmap/current?hour=12**: 获取指定小时的热力图
- **GET /api/heatmap/timeline**: 获取时间轴数据

## 使用说明

### 路径规划
1. 在控制面板的"起点"和"终点"下拉框中选择POI
2. 点击"规划路径"按钮
3. 系统将在三维地图上高亮显示最短路径
4. 点击"清除路径"可移除路径显示

### 热力图控制
1. 拖动"热力图时间"滑块切换不同时段的热力图
2. 拖动"热力图透明度"滑块调整热力图透明度
3. 勾选/取消"显示热力图"可开关热力图层

### 三维视图操作
- **鼠标左键拖动**: 旋转视角
- **鼠标右键拖动**: 平移视角
- **滚轮**: 缩放视图
- **点击POI/建筑**: 查看详细信息

## 演示模式

如果没有配置PostgreSQL数据库，系统会自动进入演示模式，使用内置的模拟数据运行。

## 开发说明

### 添加新的POI类型
1. 在后端数据库中插入新的POI记录
2. 在前端 `app.js` 的 `buildingColors` 和 `poiColors` 对象中添加对应的颜色配置

### 扩展热力图数据
- 热力图数据按时间戳存储，支持按小时、天等粒度聚合
- 可以通过 `/api/heatmap` 接口的 `granularity` 参数控制聚合粒度

## 许可证

MIT

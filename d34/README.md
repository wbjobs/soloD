# 城市地下管网管理系统

基于 Cesium.js 和 Node.js 构建的 3D 可视化地下管网管理系统。

## 功能特性

### 前端功能
- **3D 模型加载**: 支持加载 3D Tiles 格式的地下管网模型
- **剖切分析**: 支持 X/Y/Z 三个方向的模型剖切，可调节剖切位置
- **空间查询**: 可查询指定坐标点附近的管网管线
- **地图交互**: 支持地图选点、视角控制、要素拾取
- **管网可视化**: 在地图上以不同颜色展示各类管线（给水、排水、燃气、电力、通信）

### 后端功能
- **管网元数据管理**: 管理管网的材质、直径、铺设时间、埋设深度等信息
- **维修记录管理**: 记录和查询管网的维修历史
- **空间查询接口**: 基于 MongoDB 2dsphere 索引实现空间查询
- **RESTful API**: 完整的 CRUD 操作接口

## 技术栈

### 前端
- Cesium.js 1.114 - 3D 地图引擎
- 原生 HTML/CSS/JavaScript

### 后端
- Node.js + Express - Web 框架
- MongoDB + Mongoose - 数据库（支持空间索引）
- CORS - 跨域支持

## 项目结构

```
d34/
├── backend/                 # 后端目录
│   ├── models/
│   │   └── Pipeline.js     # 数据模型
│   ├── routes/
│   │   └── pipelines.js    # API 路由
│   ├── .env                # 环境配置
│   ├── server.js           # 服务器入口
│   ├── initData.js         # 示例数据初始化
│   └── package.json
└── frontend/               # 前端目录
    ├── index.html
    ├── styles.css
    └── app.js
```

## 安装与运行

### 前置要求
- Node.js (v14+)
- MongoDB (v4.0+)

### 后端启动

1. 进入后端目录并安装依赖:
```bash
cd backend
npm install
```

2. 启动 MongoDB 服务

3. 初始化示例数据 (可选):
```bash
node initData.js
```

4. 启动后端服务器:
```bash
npm start
```

后端服务将运行在 http://localhost:3001

### 前端启动

由于前端使用了 Cesium.js CDN，可以直接使用浏览器打开 `frontend/index.html` 文件，或者使用本地 HTTP 服务器：

```bash
cd frontend
npx serve .
```

然后访问 http://localhost:3000

## API 接口文档

### 基础路径
`http://localhost:3001/api/pipelines`

### 接口列表

#### 1. 获取所有管网
```
GET /
```

#### 2. 获取单个管网详情
```
GET /:id
```

#### 3. 创建新管网
```
POST /
Content-Type: application/json

{
  "name": "管线名称",
  "type": "water",
  "material": "PE",
  "diameter": 300,
  "installationDate": "2023-01-01",
  "depth": 2.5,
  "coordinates": {
    "type": "LineString",
    "coordinates": [[116.395, 39.907], [116.396, 39.908]]
  },
  "maintenanceRecords": [],
  "status": "active"
}
```

#### 4. 更新管网信息
```
PUT /:id
Content-Type: application/json
```

#### 5. 删除管网
```
DELETE /:id
```

#### 6. 空间查询 - 附近管线
```
GET /spatial/nearby?longitude=116.3975&latitude=39.9086&maxDistance=50
```

参数:
- `longitude`: 经度
- `latitude`: 纬度  
- `maxDistance`: 查询半径（米）

#### 7. 空间查询 - 相交管线
```
GET /spatial/intersects?longitude=116.3975&latitude=39.9086&depth=10
```

## 使用说明

### 1. 加载 3D Tiles 模型
- 在工具栏的"模型加载"部分输入 3D Tiles 的 URL
- 点击"加载模型"按钮

### 2. 剖切分析
- 点击"启用剖切"按钮
- 选择剖切方向（X轴/Y轴/Z轴）
- 拖动滑块调节剖切位置
- 点击"禁用剖切"取消剖切效果

### 3. 空间查询
- 方法一：直接输入经纬度坐标
- 方法二：点击"地图选点"，然后在地图上点击选择位置
- 设置查询半径
- 点击"查询附近管线"查看结果

### 4. 管网管理
- 点击"显示所有管网"可在地图上绘制数据库中的所有管线
- 不同类型的管线以不同颜色显示：
  - 蓝色：给水管线
  - 棕色：排水管线
  - 黄色：燃气管线
  - 橙色：电力管线
  - 绿色：通信管线

## 数据模型

### Pipeline (管网)
```javascript
{
  name: String,           // 管线名称
  type: String,           // 类型: water/sewage/gas/electric/telecom
  material: String,       // 材质
  diameter: Number,       // 直径(mm)
  installationDate: Date, // 铺设时间
  depth: Number,          // 埋设深度(m)
  coordinates: {          // 空间坐标(GeoJSON LineString)
    type: 'LineString',
    coordinates: [[longitude, latitude], ...]
  },
  maintenanceRecords: [   // 维修记录
    {
      date: Date,
      description: String,
      technician: String,
      cost: Number
    }
  ],
  status: String,         // 状态: active/maintenance/decommissioned
  createdAt: Date
}
```

## 注意事项

1. 确保 MongoDB 服务已启动并可连接
2. Cesium Ion 的访问 token 已内置，如需替换请修改 `frontend/app.js` 中的 token
3. 默认的 3D Tiles 示例 URL 是 Cesium 官方提供的示例，如需使用真实的地下管网数据，请替换为实际的 3D Tiles URL

## 扩展建议

1. 添加用户认证和权限管理
2. 实现管网数据的导入导出功能
3. 添加管网横截面分析功能
4. 集成管网爆管分析算法
5. 添加管网寿命预测功能
6. 实现与物联网传感器数据的实时对接

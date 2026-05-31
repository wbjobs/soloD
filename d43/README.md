# 3D Tiles BIM 建筑信息模型可视化系统

基于 Node.js + Express 后端和 CesiumJS 前端的 3D Tiles 建筑模型托管与可视化系统。

## 功能特性

- 🏢 **3D Tiles 模型托管** - 支持标准 3D Tiles 格式数据托管
- 🌍 **CesiumJS 三维可视化** - 流畅的三维地球浏览体验
- 👆 **点击交互** - 点击建筑物弹出详细属性信息
- 📊 **完整元数据** - 建筑信息、材料、设施、维护等数据
- 🎨 **现代化 UI** - 美观的界面设计和流畅的交互动画

## 项目结构

```
d43/
├── server.js                 # Node.js 后端服务
├── package.json              # 项目依赖配置
├── public/
│   └── index.html           # 前端 CesiumJS 应用
├── 3dtiles/
│   └── tileset.json         # 3D Tiles 配置文件
└── README.md                # 项目说明文档
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动服务

```bash
npm start
```

开发模式（自动重启）：

```bash
npm run dev
```

### 3. 访问应用

打开浏览器访问：
- 🌐 **前端界面**: http://localhost:3000
- 📡 **API 接口**: http://localhost:3000/api/buildings

## API 接口文档

### 获取所有建筑列表

```
GET /api/buildings
```

响应示例：
```json
[
  {
    "id": "building_001",
    "name": "科技园区A座",
    "type": "办公楼",
    "position": [116.3974, 39.9087, 0]
  }
]
```

### 获取单个建筑详情

```
GET /api/buildings/:id
```

响应示例：
```json
{
  "id": "building_001",
  "name": "科技园区A座",
  "type": "办公楼",
  "floors": 25,
  "height": 98.5,
  "area": 45000,
  "yearBuilt": 2020,
  "address": "科技园区创新大道88号",
  "owner": "科技创新发展有限公司",
  "usage": "商业办公",
  "status": "正常使用",
  "lastInspection": "2024-01-15",
  "materials": {
    "structure": "钢筋混凝土框架",
    "facade": "玻璃幕墙",
    "roof": "钢结构"
  },
  "facilities": ["电梯8部", "中央空调", "消防系统", "智能安防", "地下车位300个"]
}
```

### 健康检查

```
GET /health
```

## 3D Tiles 数据说明

### 放置自己的 3D Tiles 数据

1. 将你的 3D Tiles 文件（`tileset.json` 和相关的 `.b3dm` 文件）放入 `3dtiles` 目录
2. 修改 `public/index.html` 中的 `tilesetUrl` 为你的数据地址：
   ```javascript
   const tilesetUrl = '/3dtiles/tileset.json';
   ```
3. 重启服务即可

### 3D Tiles 格式支持

- ✅ Batched 3D Model (`.b3dm`)
- ✅ Instanced 3D Model (`.i3dm`)
- ✅ Point Cloud (`.pnts`)
- ✅ Composite (`.cmpt`)
- ✅ glTF (`.glb`, `.gltf`)

## CesiumJS 配置

### 自定义访问 Token

在 `public/index.html` 中修改：
```javascript
Cesium.Ion.defaultAccessToken = '你的 Access Token';
```

获取 Access Token: https://cesium.com/ion/

### 地形和影像服务

当前使用 Cesium Ion 提供的全球地形和影像服务。如需自定义：

```javascript
// 自定义地形
viewer.terrainProvider = new Cesium.CesiumTerrainProvider({
  url: '你的地形服务地址'
});

// 自定义影像
viewer.imageryLayers.addImageryProvider(
  new Cesium.UrlTemplateImageryProvider({
    url: '你的影像服务地址'
  })
);
```

## 功能说明

### 工具栏功能

- 🔄 **重置视角** - 将视角重置到园区整体视图
- 👁️ **显示/隐藏模型** - 切换建筑模型的显示状态
- 📋 **建筑列表** - 快速查看建筑信息

### 建筑属性信息

点击任意建筑可查看以下信息：

1. **基本信息** - 编号、类型、楼层、高度、面积、建成年份
2. **位置信息** - 地址、产权方、用途
3. **建筑材料** - 结构、外墙、屋面材料
4. **配套设施** - 电梯、空调、消防等设施标签
5. **维护信息** - 上次检查日期

## 技术栈

### 后端
- **Node.js** - JavaScript 运行时
- **Express.js** - Web 框架
- **CORS** - 跨域资源共享

### 前端
- **CesiumJS 1.114** - 三维地球引擎
- **原生 JavaScript** - 无框架依赖
- **CSS3** - 现代化样式

## 环境要求

- Node.js >= 14.0.0
- npm >= 6.0.0
- 现代浏览器（Chrome 80+, Firefox 75+, Safari 13+）

## 端口配置

默认端口为 `3000`，如需修改：

方式1 - 设置环境变量：
```bash
# Windows
set PORT=8080

# Linux/Mac
export PORT=8080
```

方式2 - 修改 `server.js`：
```javascript
const PORT = process.env.PORT || 8080;
```

## 部署建议

### 生产环境部署

1. **使用 PM2 管理进程**
   ```bash
   npm install -g pm2
   pm2 start server.js --name 3dtiles-server
   ```

2. **配置 Nginx 反向代理**
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
       
       location /3dtiles/ {
           proxy_pass http://localhost:3000/3dtiles/;
           add_header Access-Control-Allow-Origin *;
       }
   }
   ```

3. **启用 HTTPS** - 使用 Let's Encrypt 免费证书

### 性能优化

- 为 3D Tiles 文件启用 Gzip 压缩
- 配置 CDN 加速静态资源
- 使用 Redis 缓存建筑元数据
- 实现 3D Tiles 的流式加载

## 常见问题

### Q: 3D Tiles 无法加载？

A: 检查以下几点：
1. tileset.json 文件路径是否正确
2. 浏览器控制台是否有 CORS 错误
3. 3D Tiles 文件格式是否符合规范
4. 网络连接是否正常

### Q: 建筑点击无响应？

A: 确认：
1. 是否正确点击到建筑实体
2. 浏览器控制台是否有 JavaScript 错误
3. 后端 API 服务是否正常运行

### Q: 如何添加更多建筑数据？

A: 在 `server.js` 中的 `getBuildingMetadata` 函数内添加新的建筑数据对象即可。

## 许可证

MIT License

## 联系方式

如有问题或建议，欢迎提交 Issue 或 Pull Request。

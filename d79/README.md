# 离线 Markdown 编辑器

一个支持离线编辑、实时协作的 Markdown 编辑器，基于 Yjs CRDT 算法实现。

## 技术栈

### 前端
- **React 18** - UI 框架
- **CodeMirror 6** - 代码编辑器
- **Yjs** - CRDT 算法实现分布式同步
- **y-indexeddb** - IndexedDB 本地持久化
- **y-websocket** - WebSocket 实时同步
- **React Markdown** - Markdown 实时预览

### 后端
- **Node.js** - 运行环境
- **WebSocket** - 实时通信协议
- **Express** - HTTP 服务器

## 核心特性

### ✅ 离线编辑
- 所有编辑内容自动保存到 IndexedDB
- 断网时可正常编辑
- 数据永不丢失

### ✅ CRDT 实时同步
- 使用 Yjs 实现无冲突的分布式数据同步
- 多端同时编辑无冲突
- 自动合并变更

### ✅ 自动重连
- 网络恢复后自动连接服务器
- 自动同步离线期间的所有变更
- 指数退避重试机制

### ✅ Markdown 预览
- 实时双栏预览
- 支持 GFM (GitHub Flavored Markdown)
- 深色主题

## 项目结构

```
d79/
├── backend/           # 后端服务
│   ├── package.json
│   └── server.js     # WebSocket + Yjs 服务器
└── frontend/          # 前端应用
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── App.css
        ├── index.css
        ├── components/
        │   ├── Editor.jsx      # CodeMirror 编辑器组件
        │   ├── Header.jsx      # 头部组件
        │   └── StatusBar.jsx   # 状态栏组件
        └── contexts/
            └── YjsContext.jsx  # Yjs 上下文提供者
```

## 快速开始

### 1. 安装依赖

```bash
# 安装后端依赖
cd backend
npm install

# 安装前端依赖
cd ../frontend
npm install
```

### 2. 启动服务

```bash
# 启动后端 (终端 1)
cd backend
npm start
# 服务运行在 http://localhost:1234

# 启动前端 (终端 2)
cd frontend
npm run dev
# 应用运行在 http://localhost:3000
```

### 3. 使用说明

1. 打开浏览器访问 `http://localhost:3000`
2. 在顶部输入框可以切换不同的文档 ID
3. 在左侧编辑器中输入 Markdown 内容
4. 右侧会实时显示渲染效果
5. 查看底部状态栏了解网络和同步状态

## 测试离线功能

1. 打开浏览器开发者工具 (F12)
2. 进入 Network 标签页
3. 将网络设置为 "Offline"
4. 继续编辑内容 - 一切正常
5. 将网络恢复为 "Online"
6. 观察编辑器自动同步所有离线变更

## 多端协作测试

1. 在两个不同的浏览器窗口打开同一个 URL
2. 确保两个窗口使用相同的文档 ID
3. 在一个窗口中编辑
4. 观察另一个窗口实时更新

## 核心组件说明

### YjsContext.jsx
- Yjs 文档管理
- WebSocket 连接管理
- IndexedDB 持久化配置
- 在线/离线状态检测
- 自动重连逻辑

### Editor.jsx
- CodeMirror 6 编辑器集成
- Yjs 协作绑定 (yCollab)
- Markdown 实时预览
- 内容变更监听

### server.js
- Yjs WebSocket 服务器
- 多文档管理
- 健康检查 API
- CORS 支持

## CRDT 工作原理

Yjs 使用 **状态复制** 的 CRDT 算法：

1. **每个操作** 都被编码为一个小的、可合并的状态向量
2. **本地更新** 立即应用，无需等待服务器确认
3. **同步时** 交换状态向量，自动合并冲突
4. **最终一致性** 保证所有副本最终状态一致

## 数据持久化

1. **IndexedDB** - 浏览器本地存储，离线可用
2. **WebSocket** - 实时同步到服务器
3. **内存** - 快速访问的 Yjs 文档

## API 端点

- `GET /health` - 健康检查
- `GET /api/docs` - 获取当前活跃文档列表

## 开发说明

### 后端开发模式
```bash
cd backend
npm run dev  # 使用 nodemon 自动重启
```

### 前端代码检查
```bash
cd frontend
npm run lint
```

## 浏览器兼容性

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

所有支持 IndexedDB 和 WebSocket 的现代浏览器。

## 许可证

MIT
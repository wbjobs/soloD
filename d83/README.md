# Markdown 协同编辑器

一个支持离线编辑的 Markdown 协同编辑器，使用 Yjs CRDT 协议实现实时多人协作。

## 技术栈

### 后端
- Node.js + TypeScript
- WebSocket (ws)
- Yjs + y-protocols
- LevelDB (持久化存储)

### 前端
- React 18 + TypeScript
- Vite
- CodeMirror 6 (编辑器)
- React Markdown (预览)
- Yjs CRDT 同步
- IndexedDB (本地持久化)
- Tailwind CSS (样式)

## 核心功能

1. **实时协同编辑** - 多用户同时编辑同一文档，实时看到对方的修改
2. **离线编辑** - 断网期间可以继续编辑，网络恢复后自动同步
3. **冲突自动合并** - 使用 Yjs CRDT 算法自动解决编辑冲突
4. **Markdown 实时预览** - 分屏显示编辑器和预览效果
5. **在线用户显示** - 显示当前在线用户和协作者光标
6. **数据持久化** - 数据保存到服务器 LevelDB 和本地 IndexedDB

## 项目结构

```
markdown-collab-editor/
├── server/                 # 后端服务
│   ├── src/
│   │   └── server.ts      # WebSocket 服务器
│   ├── package.json
│   ├── tsconfig.json
│   └── db/                # LevelDB 数据目录 (自动创建)
├── client/                 # 前端应用
│   ├── src/
│   │   ├── App.tsx        # 主应用
│   │   ├── Editor.tsx     # 编辑器组件
│   │   ├── Preview.tsx    # Markdown 预览
│   │   ├── yjs-setup.ts   # Yjs 配置
│   │   ├── main.tsx       # 入口文件
│   │   └── index.css      # 样式
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── index.html
└── README.md
```

## 快速开始

### 1. 启动后端服务

```bash
cd server
npm install
npm run dev
```

后端服务将在 `ws://localhost:1234` 启动。

### 2. 启动前端应用

```bash
cd client
npm install
npm run dev
```

前端应用将在 `http://localhost:5173` 启动。

### 3. 测试协同编辑

打开多个浏览器窗口访问 `http://localhost:5173`，在一个窗口中编辑内容，其他窗口将实时同步。

## 离线编辑测试

1. 在编辑器中输入一些内容
2. 停止后端服务 (Ctrl+C)
3. 继续在编辑器中编辑内容（离线模式）
4. 重新启动后端服务
5. 观察离线期间的编辑是否自动同步到服务器

## 构建生产版本

### 后端

```bash
cd server
npm run build
npm start
```

### 前端

```bash
cd client
npm run build
npm run preview
```

## 实现原理

### CRDT 同步
使用 Yjs 的无冲突复制数据类型 (CRDT) 实现：
- 每个客户端维护本地文档状态
- 所有操作通过向量时钟进行追踪
- 操作自动合并，无需手动解决冲突

### 离线支持
- 本地使用 IndexedDB 持久化文档状态
- WebSocket 断线自动重连
- 重连后自动同步本地累积的更新

### 服务端持久化
- 使用 LevelDB 存储文档状态和更新历史
- 支持文档恢复和版本管理

## 许可证

MIT

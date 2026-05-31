# PWA 笔记应用

一个具有离线编辑能力的渐进式 Web 应用（PWA）笔记应用，使用 SvelteKit 构建，集成 IndexedDB 本地存储和 Firebase Firestore 云端同步。

## 功能特性

- ✅ **离线编辑**: 使用 IndexedDB 进行本地存储，支持完全离线使用
- ✅ **自动同步**: 网络恢复后自动将本地变更同步到 Firebase
- ✅ **PWA 支持**: 可安装为桌面/移动应用，支持离线访问
- ✅ **实时状态**: 显示网络状态和同步状态
- ✅ **响应式设计**: 适配桌面和移动设备
- ✅ **笔记管理**: 创建、编辑、删除笔记

## 技术栈

- **前端框架**: SvelteKit
- **本地存储**: IndexedDB (使用 idb 库)
- **后端数据库**: Firebase Firestore
- **类型安全**: TypeScript
- **样式**: 原生 CSS

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 Firebase

1. 在 [Firebase Console](https://console.firebase.google.com/) 创建一个新项目
2. 启用 Firestore Database
3. 复制 `.env.example` 为 `.env` 并填入您的 Firebase 配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件，填入您的 Firebase 项目凭证。

### 3. 启动开发服务器

```bash
npm run dev
```

应用将在 `http://localhost:5173` 启动。

### 4. 构建生产版本

```bash
npm run build
```

## 项目结构

```
src/
├── lib/
│   ├── db/              # IndexedDB 数据库操作
│   │   └── indexedDB.ts
│   ├── firebase/        # Firebase 配置和操作
│   │   ├── config.ts
│   │   └── notes.ts
│   ├── stores/          # Svelte 状态管理
│   │   ├── network.ts
│   │   └── sync.ts
│   ├── sync/            # 同步服务
│   │   └── syncService.ts
│   ├── styles/          # 全局样式
│   │   └── global.css
│   └── types/           # TypeScript 类型定义
│       └── note.ts
├── routes/              # SvelteKit 路由
│   ├── +layout.svelte
│   ├── +page.svelte     # 笔记列表页
│   └── note/[id]/       # 笔记编辑页
│       └── +page.svelte
├── service-worker.ts    # PWA Service Worker
├── app.html             # HTML 模板
└── app.d.ts             # 类型声明
```

## 核心功能说明

### 离线存储 (IndexedDB)

应用使用 IndexedDB 进行本地数据存储，确保在离线状态下也能正常使用。主要功能包括：

- 笔记的 CRUD 操作
- 同步状态标记
- 按更新时间排序

### 同步机制

同步服务负责处理本地数据和云端数据的同步：

1. **在线时**: 保存笔记时立即同步到 Firebase
2. **离线时**: 数据保存在本地，标记为未同步
3. **网络恢复**: 自动检测网络状态，同步所有未同步的更改

### PWA 功能

Service Worker 提供以下 PWA 功能：

- 静态资源缓存
- 离线页面访问
- 应用安装功能

## Firebase 配置

确保您的 Firestore 安全规则允许读写操作。开发阶段可以使用：

```rules
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

**注意**: 在生产环境中请配置适当的安全规则和认证。

## 浏览器兼容性

- Chrome 60+
- Firefox 54+
- Safari 11.1+
- Edge 79+

## 开发说明

### 离线测试

在 Chrome DevTools 中：
1. 打开 Network 标签
2. 勾选 "Offline" 选项模拟离线状态
3. 创建/编辑笔记，数据将保存在本地
4. 取消 "Offline" 选项，观察自动同步

### 查看 IndexedDB 数据

在 Chrome DevTools 中：
1. 打开 Application 标签
2. 在左侧导航中找到 IndexedDB
3. 展开查看 `notes-db` 数据库

## License

MIT

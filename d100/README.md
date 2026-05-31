# IPFS 网关服务

一个基于 Node.js 和 Preact 的本地 IPFS 网关服务，支持文件上传、CID 管理和内容预览。

## 功能特性

- 🔒 **去中心化存储**: 使用 IPFS 网络进行文件存储
- 📤 **文件上传**: 支持点击和拖拽方式上传任意格式文件
- 📄 **CID 管理**: 显示已上传文件的 CID 列表
- 👁️ **内容预览**: 点击文件可预览文本内容
- 📦 **二进制支持**: 完美处理二进制文件流

## 项目结构

```
.
├── backend/                 # Node.js 后端
│   ├── server.js           # 服务器主文件
│   └── package.json        # 后端依赖配置
├── frontend/               # Preact 前端
│   ├── src/
│   │   ├── App.jsx        # 主应用组件
│   │   ├── main.jsx       # 入口文件
│   │   └── index.css      # 样式文件
│   ├── index.html          # HTML 模板
│   ├── vite.config.js      # Vite 配置
│   └── package.json        # 前端依赖配置
└── package.json            # 根目录配置
```

## 后端 API

### 1. 上传文件

```
POST /api/upload
Content-Type: multipart/form-data
```

**参数:**
- `file`: 要上传的文件

**响应:**
```json
{
  "success": true,
  "cid": "Qm...",
  "filename": "example.txt",
  "size": 1024
}
```

### 2. 通过 CID 读取文件

```
GET /api/file/:cid
```

**参数:**
- `cid`: 文件的内容标识符

**响应:**
- 返回文件的原始内容

### 3. 获取已上传文件列表

```
GET /api/files
```

**响应:**
```json
{
  "success": true,
  "files": [
    {
      "cid": "Qm...",
      "filename": "example.txt",
      "size": 1024,
      "uploadedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

## 安装和运行

### 前置要求

1. **Node.js**: 版本 16 或更高
2. **IPFS Daemon**: 需要本地运行 IPFS 守护进程

### 安装 IPFS

如果你还没有安装 IPFS，可以按照以下步骤安装：

**Windows (使用 Chocolatey):**
```bash
choco install kubo
```

**或者从官网下载:**
- 访问 https://dist.ipfs.tech/#kubo
- 下载适合你系统的版本
- 解压并添加到系统 PATH

**初始化 IPFS:**
```bash
ipfs init
```

**启动 IPFS 守护进程:**
```bash
ipfs daemon
```

确保守护进程运行在 `http://localhost:5001`

### 安装项目依赖

在项目根目录执行:

```bash
npm run install:all
```

或者分别安装:

```bash
# 安装后端依赖
cd backend
npm install

# 安装前端依赖
cd ../frontend
npm install
```

### 启动服务

1. **首先启动 IPFS 守护进程**（在单独的终端）:
   ```bash
   ipfs daemon
   ```

2. **启动后端服务**（在新的终端）:
   ```bash
   npm run start:backend
   ```
   后端将运行在 `http://localhost:3001`

3. **启动前端开发服务器**（在新的终端）:
   ```bash
   npm run dev:frontend
   ```
   前端将运行在 `http://localhost:3000`

4. 在浏览器中打开 `http://localhost:3000` 即可使用

## 使用说明

1. **上传文件**:
   - 点击上传区域或拖拽文件到上传区域
   - 支持任意格式的文件（文本、图片、二进制文件等）
   - 上传成功后会显示文件的 CID

2. **查看文件列表**:
   - 所有已上传的文件会显示在文件列表中
   - 显示文件名、CID、文件大小和上传时间
   - 最新上传的文件显示在最前面

3. **预览文件内容**:
   - 点击任意文件项可以预览其内容
   - 文本文件可以直接查看内容
   - 底部显示文件的 CID

## 技术栈

**后端:**
- Node.js
- Express.js
- ipfs-http-client
- multer (文件上传处理)
- CORS (跨域支持)

**前端:**
- Preact (轻量级 React 替代)
- Vite (构建工具)
- 原生 CSS 样式

## 注意事项

1. 确保 IPFS 守护进程正在运行，否则后端无法连接到 IPFS 网络
2. 已上传的文件列表存储在内存中，重启后端服务后会丢失
3. 大文件上传可能需要较长时间，请耐心等待
4. 预览功能主要适用于文本文件，二进制文件可能显示为乱码

## 开发模式

如果需要在开发模式下运行（支持热重载）:

```bash
# 后端开发模式
cd backend
npm run dev

# 前端开发模式
cd frontend
npm run dev
```

# 射电望远镜数据归档系统

## 项目概述

这是一个用于处理射电望远镜观测数据的归档系统，支持大文件分块上传、元数据提取和天球空间检索。

## 技术栈

### 前端
- React 18 + TypeScript
- Vite (构建工具)
- Tailwind CSS (样式)
- Leaflet + React-Leaflet (天球地图)
- Zustand (状态管理)
- Axios (HTTP客户端)

### 后端
- FastAPI (Python Web框架)
- SQLAlchemy 2.0 + asyncpg (异步数据库操作)
- GeoAlchemy2 (空间数据处理)
- Astropy (FITS文件处理)
- PostgreSQL + PostGIS (数据库)

## 功能特性

1. **大文件分块上传**
   - 支持5MB分块大小
   - 并发上传支持
   - SHA-256哈希校验
   - 断点续传能力

2. **FITS元数据自动提取**
   - 自动解析观测时间
   - 提取频率范围
   - 获取天球坐标(赤经/赤纬)

3. **天球图可视化检索**
   - 基于Leaflet的交互式地图
   - 天区框选功能
   - 空间范围查询
   - 观测点标记显示

4. **数据管理**
   - 数据列表分页显示
   - 详细信息查看
   - 文件下载功能

## 快速开始

### 前置要求

- Node.js 18+
- Python 3.11+
- PostgreSQL 15+ (需安装PostGIS扩展)

### 前端启动

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

前端将在 http://localhost:5173 启动

### 后端启动

```bash
cd backend

# 创建虚拟环境
python -m venv venv

# 激活虚拟环境 (Windows)
venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 配置数据库连接
# 编辑 .env 文件中的 DATABASE_URL

# 启动后端服务器
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

后端API文档将在 http://localhost:8000/docs 查看

### 数据库设置

```sql
-- 创建数据库
CREATE DATABASE radio_archive;

-- 连接到数据库
\c radio_archive;

-- 启用PostGIS扩展
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
```

## 项目结构

```
├── src/                          # 前端源代码
│   ├── components/               # React组件
│   │   ├── Layout.tsx           # 布局组件
│   │   └── ChunkUploader.tsx    # 分块上传组件
│   ├── pages/                    # 页面组件
│   │   ├── Home.tsx             # 首页
│   │   ├── Upload.tsx           # 上传页面
│   │   ├── SkyMap.tsx           # 天球图页面
│   │   ├── DataList.tsx         # 数据列表
│   │   └── DataDetail.tsx       # 数据详情
│   ├── lib/                      # 工具库
│   │   ├── api.ts               # API客户端
│   │   ├── hash.ts              # 哈希计算
│   │   └── utils.ts             # 工具函数
│   └── App.tsx                   # 主应用
├── backend/                      # 后端源代码
│   ├── app/
│   │   ├── api/                 # API路由
│   │   │   ├── upload.py        # 上传相关接口
│   │   │   └── query.py         # 查询相关接口
│   │   ├── services/            # 业务逻辑
│   │   │   ├── upload_service.py # 上传服务
│   │   │   ├── query_service.py # 查询服务
│   │   │   └── fits_service.py  # FITS文件处理
│   │   └── models/              # 数据模型
│   │       ├── database.py      # 数据库模型
│   │       └── schemas.py       # Pydantic模型
│   ├── uploads/                 # 文件存储目录
│   ├── chunks/                  # 分块临时存储
│   ├── .env                     # 环境变量
│   └── main.py                  # 应用入口
└── init_db.sql                  # 数据库初始化脚本
```

## API接口

### 上传接口
- `POST /api/upload/init` - 初始化上传会话
- `POST /api/upload/chunk` - 上传分块
- `POST /api/upload/complete` - 完成上传并合并

### 查询接口
- `GET /api/observations` - 获取观测数据列表
- `GET /api/observations/{id}` - 获取单个观测数据
- `POST /api/observations/query/spatial` - 空间范围查询

## 使用说明

1. **上传数据**
   - 进入"数据上传"页面
   - 拖拽或选择FITS格式文件
   - 等待分块上传完成
   - 系统自动提取元数据并归档

2. **天区检索**
   - 进入"天球检索"页面
   - 在地图上按住鼠标拖动框选天区
   - 查看检索结果列表
   - 点击查看详细信息

3. **数据管理**
   - 进入"数据列表"页面
   - 查看所有已归档数据
   - 点击"查看"进入详情页
   - 可下载原始FITS文件

## 配置说明

### 前端配置
- API基础地址: `src/lib/api.ts` 中修改 `API_BASE_URL`

### 后端配置
- 数据库连接: `backend/.env` 中修改 `DATABASE_URL`
- 分块大小: `backend/.env` 中修改 `CHUNK_SIZE`
- 文件存储路径: `backend/.env` 中修改存储目录

## 浏览器支持

- Chrome (推荐)
- Firefox
- Safari
- Edge

## 许可证

MIT License

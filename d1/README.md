# 多租户权限管理系统

基于 Node.js + Express + PostgreSQL + React + Ant Design 开发的完整多租户权限管理系统。

## 功能特性

### 后端
- 多租户数据隔离（Schema级隔离）
- RBAC权限模型（用户-角色-权限三级关联）
- 基于JWT的身份认证，支持租户ID解析
- 权限中间件，对接口进行权限控制
- 用户、角色、权限的CRUD接口

### 前端
- 登录页，支持租户ID输入
- 侧边栏动态路由，根据用户权限渲染菜单
- 用户管理页面
- 角色管理页面
- 权限列表页面
- 给角色分配权限、给用户分配角色功能

## 技术栈

### 后端
- Node.js
- Express.js
- PostgreSQL
- JWT (jsonwebtoken)
- bcryptjs

### 前端
- React 18
- React Router 6
- Ant Design 5
- Axios

## 项目结构

```
d1/
├── backend/
│   ├── src/
│   │   ├── config/          # 数据库配置
│   │   ├── controllers/     # 控制器
│   │   ├── middleware/      # 中间件
│   │   ├── routes/          # 路由
│   │   └── server.js        # 入口文件
│   ├── database/            # 数据库初始化脚本
│   ├── package.json
│   └── .env
└── frontend/
    ├── src/
    │   ├── components/      # 组件
    │   ├── pages/           # 页面
    │   ├── services/        # API服务
    │   ├── utils/           # 工具函数
    │   └── App.js           # 应用入口
    └── package.json
```

## 运行说明

### 前置要求
- Node.js >= 16
- PostgreSQL >= 12

### 1. 数据库准备

确保PostgreSQL服务已启动，并创建一个超级用户（默认使用postgres/postgres）。

### 2. 初始化数据库

```bash
cd backend
npm install
npm run init-db
```

该脚本会：
- 创建数据库 `multi_tenant_rbac`
- 创建公共表和两个租户schema（tenant1, tenant2）
- 初始化测试数据

### 3. 启动后端服务

```bash
cd backend
npm start
```

后端服务将在 `http://localhost:3001` 启动

### 4. 启动前端服务

```bash
cd frontend
npm install
npm start
```

前端服务将在 `http://localhost:3000` 启动

### 5. 测试账号

| 租户ID | 用户名 | 密码 | 说明 |
|--------|--------|------|------|
| 1 | admin | 123456 | 超级管理员 |
| 1 | user1 | 123456 | 普通用户 |
| 2 | admin | 123456 | 超级管理员（租户2） |
| 2 | user1 | 123456 | 普通用户（租户2） |

## API接口

### 认证接口
- `POST /api/auth/login` - 用户登录
- `GET /api/auth/me` - 获取当前用户信息

### 用户接口
- `GET /api/users` - 获取用户列表
- `GET /api/users/:id` - 获取单个用户
- `POST /api/users` - 创建用户
- `PUT /api/users/:id` - 更新用户
- `DELETE /api/users/:id` - 删除用户
- `POST /api/users/:userId/roles` - 分配角色

### 角色接口
- `GET /api/roles` - 获取角色列表
- `GET /api/roles/:id` - 获取单个角色
- `POST /api/roles` - 创建角色
- `PUT /api/roles/:id` - 更新角色
- `DELETE /api/roles/:id` - 删除角色
- `POST /api/roles/:roleId/permissions` - 分配权限

### 权限接口
- `GET /api/permissions` - 获取权限列表
- `GET /api/permissions/:id` - 获取单个权限

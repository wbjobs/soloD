# 低代码开发平台 - 部署说明

## 📋 项目架构

本项目基于 **微前端架构** 开发，包含以下模块：

```
lowcode-platform/
├── backend/              # 后端服务 (Node.js + MongoDB)
├── main-app/             # 主应用基座 (Vue 3 + Qiankun)
├── micro-apps/
│   ├── editor/          # 低代码编辑器微应用
│   └── renderer/        # 页面渲染器微应用
└── shared/              # 共享资源
```

## 🚀 环境要求

- Node.js >= 16.0.0
- MongoDB >= 4.0
- npm 或 yarn

## 📦 安装依赖

### 1. 后端服务

```bash
cd backend
npm install
```

### 2. 主应用

```bash
cd main-app
npm install
```

### 3. 编辑器微应用

```bash
cd micro-apps/editor
npm install
```

### 4. 渲染器微应用

```bash
cd micro-apps/renderer
npm install
```

## ⚙️ 配置环境变量

### 后端配置 (`backend/.env`)

```env
PORT=3000
MONGODB_URI=mongodb://localhost:27017/lowcode-platform
```

确保 MongoDB 服务已启动。

## 🏃 启动项目

### 方式一：分别启动（推荐用于开发）

#### 1. 启动后端服务

```bash
cd backend
npm run dev
```
服务地址: http://localhost:3000

#### 2. 启动主应用

```bash
cd main-app
npm run dev
```
服务地址: http://localhost:8080

#### 3. 启动编辑器微应用

```bash
cd micro-apps/editor
npm run dev
```
服务地址: http://localhost:8081

#### 4. 启动渲染器微应用

```bash
cd micro-apps/renderer
npm run dev
```
服务地址: http://localhost:8082

## 📖 使用指南

### 1. 访问平台

打开浏览器访问: http://localhost:8080

### 2. 创建项目

- 点击"新建项目"按钮
- 填写项目名称和描述
- 点击创建

### 3. 编辑页面

#### 拖拽组件
- 从左侧组件库拖拽组件到画布
- 画布区域会有拖拽高亮提示
- 组件自动按顺序排列，不会错位

#### 组件排序
- 拖拽画布上的组件可以调整顺序
- 使用组件右上角的 ↑↓ 按钮上下移动组件
- 使用 删除 按钮移除组件

#### 配置组件属性
- 点击画布上的组件进行选中
- 在右侧属性面板配置基础属性

#### 数据绑定
1. 选择"数据绑定"标签页
2. 选择数据源类型：
   - **静态数据**: 直接输入 JSON 格式数据
   - **API 接口**: 配置接口地址和请求方法
3. API 接口配置：
   - 输入接口 URL
   - 选择 GET 或 POST 方法
   - 可选配置数据路径（如 `data.list`）
4. 点击"测试接口"按钮验证数据获取

#### 样式配置
- 显示方式（block/inline-block/flex）
- 宽度、高度
- 字体大小、文字颜色
- 外边距、内边距
- 背景色、边框、圆角

#### 版本管理
- **保存新版本**: 点击"版本管理" -> "保存新版本"
- **历史版本**: 查看所有历史版本记录
- **版本回滚**: 选择任意历史版本进行回滚
- **版本对比**: 对比两个版本的差异（新增、删除、修改的组件）

#### 权限管理
- 点击"权限管理"按钮打开权限配置
- 添加用户并分配权限（查看/编辑/发布/删除）
- 支持基于角色的权限控制
- 管理员拥有所有权限

### 4. 自定义组件
- 点击"组件库"菜单
- 切换到"自定义组件"标签
- 支持上传 JSON 格式的组件定义
- 支持导出已发布的组件
- 组件状态管理（草稿/已发布/已废弃）
- 自定义组件自动出现在编辑器的组件库中

### 5. 预览和发布

- 点击"预览"在新窗口查看页面效果
- 数据绑定会在预览页面自动生效
- 点击"发布"将页面状态设为已发布

## ✨ 新增功能 (v2.0.0)

### 🎁 自定义组件管理
- ✅ 自定义组件上传和注册
- ✅ 组件 JSON 模板下载
- ✅ 自定义组件导出
- ✅ 组件版本和状态管理
- ✅ 自定义组件在编辑器中可用

### 📚 页面版本管理
- ✅ 创建页面版本快照保存
- ✅ 版本历史列表
- ✅ 版本回滚功能
- ✅ 版本对比（差异可视化）
- ✅ 版本描述和命名

### 🔐 权限控制系统
- ✅ 用户管理（CRUD）
- ✅ 基于角色的权限控制
- ✅ 页面级权限管理
- ✅ 四种权限类型：查看/编辑/发布/删除
- ✅ 用户状态管理（正常/禁用）

## 🔧 后端 API 接口

### 项目管理
- `GET /api/projects` - 获取项目列表
- `GET /api/projects/:id` - 获取项目详情
- `POST /api/projects` - 创建项目
- `PUT /api/projects/:id` - 更新项目
- `DELETE /api/projects/:id` - 删除项目

### 页面管理
- `GET /api/pages` - 获取页面列表
- `GET /api/pages/:id` - 获取页面详情
- `POST /api/pages` - 创建页面
- `PUT /api/pages/:id` - 更新页面
- `DELETE /api/pages/:id` - 删除页面

### 组件管理
- `GET /api/components` - 获取系统组件列表
- `GET /api/components/:id` - 获取组件详情
- `POST /api/components` - 创建组件
- `PUT /api/components/:id` - 更新组件
- `DELETE /api/components/:id` - 删除组件
- `POST /api/components/:id/publish` - 发布组件

### 自定义组件管理
- `GET /api/custom-components` - 获取自定义组件列表
- `GET /api/custom-components/:id` - 获取组件详情
- `POST /api/custom-components` - 创建组件
- `PUT /api/custom-components/:id` - 更新组件
- `DELETE /api/custom-components/:id` - 删除组件
- `POST /api/custom-components/:id/publish` - 发布组件
- `POST /api/custom-components/upload` - 上传组件文件
- `GET /api/custom-components/export/:id` - 导出组件

### 页面版本管理
- `GET /api/page-versions/:pageId` - 获取页面版本列表
- `GET /api/page-versions/:pageId/:version` - 获取指定版本
- `POST /api/page-versions/create` - 创建新版本
- `POST /api/page-versions/rollback` - 版本回滚
- `GET /api/page-versions/compare/:pageId` - 版本对比
- `DELETE /api/page-versions/:id` - 删除版本

### 用户管理
- `GET /api/users` - 获取用户列表
- `GET /api/users/:id` - 获取用户详情
- `POST /api/users` - 创建用户
- `PUT /api/users/:id` - 更新用户
- `DELETE /api/users/:id` - 删除用户

### 权限管理
- `GET /api/permissions/:pageId` - 获取页面权限
- `GET /api/permissions/user/:userId` - 获取用户权限
- `POST /api/permissions/check` - 检查权限
- `POST /api/permissions` - 添加/更新权限
- `POST /api/permissions/batch` - 批量设置权限
- `DELETE /api/permissions/:id` - 删除权限

### 渲染服务
- `GET /api/render/page/:pageId` - 获取页面schema
- `GET /api/render/page-by-path/:projectId/:path` - 按路径获取页面
- `GET /api/render/components` - 获取已发布组件

## 💡 数据绑定示例

### 表格组件 - 绑定 API 数据

1. 拖拽表格组件到画布
2. 选中组件，点击"数据绑定"
3. 选择"API 接口"
4. 输入接口地址：`https://jsonplaceholder.typicode.com/users`
5. 方法选择：GET
6. 点击"测试接口"验证
7. 在"基础属性"中配置列：
   ```json
   [{"prop": "name", "label": "姓名"}, {"prop": "email", "label": "邮箱"}]
   ```
8. 保存并预览

### 下拉选择 - 静态数据

1. 拖拽下拉组件到画布
2. 选中组件，点击"数据绑定"
3. 选择"静态数据"
4. 输入：
   ```json
   [{"label": "选项A", "value": "a"}, {"label": "选项B", "value": "b"}]
   ```
5. 保存即可生效

### 自定义组件模板

```json
{
  "name": "我的自定义组件",
  "type": "MyCustomComponent",
  "category": "custom",
  "icon": "🔧",
  "description": "这是一个自定义组件",
  "version": "1.0.0",
  "author": "开发者",
  "schema": {
    "props": { "text": "默认文本" },
    "style": { "color": "#333" },
    "events": []
  },
  "sourceCode": {
    "template": "<div>{{ text }}</div>",
    "script": "export default { props: ['text'] }"
  },
  "status": "draft"
}
```

## 🎯 功能特性

- ✅ 项目和页面管理
- ✅ 组件库管理和发布
- ✅ 自定义组件上传和注册
- ✅ 自定义组件导入导出
- ✅ 可视化拖拽编辑器
- ✅ 组件拖拽排序
- ✅ 组件属性配置
- ✅ 组件样式自定义
- ✅ API 数据绑定
- ✅ 静态数据绑定
- ✅ 页面版本管理
- ✅ 版本回滚和对比
- ✅ 用户管理和权限控制
- ✅ 角色权限管理
- ✅ 页面预览和发布
- ✅ 微前端架构
- ✅ RESTful API

## 📝 更新日志

### v2.0.0 (2026-05-13)
- ✨ 新增自定义组件管理功能
- ✨ 新增页面版本管理（快照、回滚、对比
- ✨ 新增用户和权限控制系统
- ✨ 编辑器集成自定义组件支持

### v1.1.0
- 修复拖拽错位问题
- 新增数据绑定功能
- 改进布局稳定性
- 新增组件排序按钮

### v1.0.0
- 初始版本发布
- 实现基础低代码编辑功能
- 实现微前端架构集成
- 支持8种基础组件
# 社交网络分析系统

一个基于 Neo4j 图数据库、Apollo Server GraphQL 和 React 的社交网络分析系统，提供子图可视化、最短路径查询、共同好友分析和关键节点影响力评估功能。

## 技术栈

### 后端
- **Neo4j**: 图数据库，存储用户和好友关系
- **Apollo Server**: GraphQL 服务器
- **Node.js**: 运行环境

### 前端
- **React**: 用户界面框架
- **Apollo Client**: GraphQL 客户端
- **react-force-graph-2d**: 力导向图可视化组件
- **Tailwind CSS**: 样式框架

## 功能特性

1. **子图查询** - 以某个用户为中心，查看其 N 层关系网络的力导向图
2. **最短路径** - 查询两个用户之间的最短连接路径并可视化
3. **共同好友** - 分析两个用户的共同好友列表
4. **关键节点** - 基于度中心性计算用户影响力排名
5. **示例数据生成** - 一键生成测试用的用户和好友关系数据

## 项目结构

```
d77/
├── backend/                 # 后端项目
│   ├── src/
│   │   ├── config/
│   │   │   └── neo4j.js    # Neo4j 数据库连接
│   │   ├── schema/
│   │   │   ├── typeDefs.js # GraphQL 类型定义
│   │   │   └── resolvers.js # GraphQL 解析器
│   │   └── index.js        # 服务入口
│   ├── package.json
│   └── .env                # 环境变量
└── frontend/                # 前端项目
    ├── src/
    │   ├── components/
    │   │   ├── panels/     # 各个功能面板
    │   │   ├── GraphVisualization.js # 图可视化组件
    │   │   └── Sidebar.js  # 侧边栏导航
    │   ├── graphql/
    │   │   └── queries.js  # GraphQL 查询定义
    │   ├── App.js
    │   ├── index.js
    │   └── index.css
    └── package.json
```

## 安装与运行

### 前置要求

- Node.js (v16+)
- Neo4j 数据库 (v4.4+)

### 1. 启动 Neo4j 数据库

确保 Neo4j 正在运行，并记录连接信息（默认为 `bolt://localhost:7687`）

### 2. 后端安装与运行

```bash
cd backend
npm install
npm start
```

后端服务将在 http://localhost:4000 启动

### 3. 前端安装与运行

```bash
cd frontend
npm install
npm start
```

前端应用将在 http://localhost:3000 启动

## 配置说明

### 后端环境变量 (.env)

```
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=your_password
PORT=4000
```

## GraphQL API

### 查询类型

- `users` - 获取所有用户
- `user(id)` - 获取单个用户
- `shortestPath(fromId, toId)` - 查询最短路径
- `mutualFriends(userId1, userId2)` - 查询共同好友
- `keyInfluencers(limit)` - 获取关键节点
- `getSubGraph(centerId, depth)` - 获取子图

### 变更类型

- `createUser(name, email, avatar)` - 创建用户
- `createFriendship(fromId, toId, since)` - 创建好友关系
- `generateSampleData(userCount, friendshipCount)` - 生成示例数据
- `clearAllData` - 清除所有数据

## 使用说明

1. 打开前端应用后，首先在侧边栏点击"生成示例数据"按钮
2. 选择要查看的功能标签：
   - 子图查询：选择用户和深度，查看关系网络
   - 最短路径：选择两个用户，查看连接路径
   - 共同好友：选择两个用户，查看共同好友列表
   - 关键节点：查看影响力排名前 N 的用户

## 图算法说明

### 最短路径
使用 Neo4j 内置的 `shortestPath` 算法，基于广度优先搜索查找两个节点之间的最短路径。

### 共同好友
通过模式匹配查找与两个用户都有连接的中间节点。

### 度中心性
计算每个用户的好友数量（入度 + 出度），度数越高表示影响力越大。

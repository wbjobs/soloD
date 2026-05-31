# Strapi Headless CMS

这是一个使用 Strapi 框架搭建的 Headless CMS 项目，包含自定义的 GraphQL API。

## 功能特性

- **内容模型**：
  - Author（作者）：包含 name、email、bio 字段
  - Article（文章）：包含 title、content、likes、publishedAt 字段
  - 一对多关系：一个作者可以有多篇文章

- **自定义 GraphQL 查询**：
  - `popularArticles(limit: Int)`：返回点赞数最高的 N 篇文章

- **权限配置**：
  - 公开访问：查找所有文章 (find)
  - 管理员权限：创建、更新、删除文章

## 安装步骤

1. 安装依赖：
```bash
cd strapi-cms
npm install
```

2. 配置数据库（可选）：
   - 当前使用 SQLite
   - 如需使用 MySQL，修改 `config/database.js`：
   ```javascript
   module.exports = ({ env }) => ({
     connection: {
       client: 'mysql',
       connection: {
         host: env('DATABASE_HOST', 'localhost'),
         port: env.int('DATABASE_PORT', 3306),
         database: env('DATABASE_NAME', 'strapi_cms'),
         user: env('DATABASE_USERNAME', 'root'),
         password: env('DATABASE_PASSWORD', ''),
         ssl: env.bool('DATABASE_SSL', false),
       },
     },
   });
   ```

3. 启动开发服务器：
```bash
npm run develop
```

4. 访问管理面板：
   - 打开 http://localhost:1337/admin
   - 创建管理员账户

## 权限配置

在 Strapi 管理面板中配置权限：

1. 进入 **Settings** → **Users & Permissions Plugin** → **Roles**
2. 编辑 **Public** 角色：
   - 在 **Article** 权限下，勾选 `find` 和 `findOne`
   - 保存
3. 编辑 **Authenticated** 角色（可选）：
   - 根据需要配置其他权限

## GraphQL 使用

访问 GraphQL  playground：http://localhost:1337/graphql

### 查询热门文章示例

```graphql
query {
  popularArticles(limit: 5) {
    data {
      id
      attributes {
        title
        content
        likes
        author {
          data {
            attributes {
              name
              email
            }
          }
        }
      }
    }
  }
}
```

### 查询所有文章示例

```graphql
query {
  articles {
    data {
      id
      attributes {
        title
        likes
        author {
          data {
            attributes {
              name
            }
          }
        }
      }
    }
  }
}
```

## REST API 使用

- 获取所有文章：`GET /api/articles`
- 获取单篇文章：`GET /api/articles/:id`
- 创建文章（需认证）：`POST /api/articles`
- 更新文章（需认证）：`PUT /api/articles/:id`
- 删除文章（需认证）：`DELETE /api/articles/:id`

## 项目结构

```
strapi-cms/
├── src/
│   ├── api/
│   │   ├── author/
│   │   │   ├── content-types/
│   │   │   ├── controllers/
│   │   │   ├── routes/
│   │   │   └── services/
│   │   └── article/
│   │       ├── content-types/
│   │       ├── controllers/
│   │       ├── routes/
│   │       └── services/
│   ├── extensions/
│   └── index.js          # 自定义 GraphQL 配置
├── config/
│   ├── database.js
│   ├── server.js
│   ├── admin.js
│   └── api.js
└── package.json
```

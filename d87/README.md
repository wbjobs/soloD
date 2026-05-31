# npm 依赖可视化工具

一个基于 Python Flask 和 D3.js 的 npm 包依赖可视化工具，支持 CVE 漏洞检测。

## 功能特性

- 🔍 **依赖爬取**：从 npm 注册表爬取指定包的依赖树
- 📊 **图可视化**：使用 D3.js 力导向图展示依赖关系
- ⚠️ **漏洞检测**：集成 OSV API 检测已知的 CVE 漏洞
- 🎨 **交互式 UI**：支持缩放、拖拽节点、点击查看详情
- 💾 **数据库存储**：使用 Neo4j 图数据库存储依赖关系

## 技术栈

### 后端
- **Python 3.x**
- **Flask** - Web 框架
- **Neo4j** - 图数据库
- **OSV API** - 漏洞数据库

### 前端
- **D3.js v7** - 数据可视化
- **原生 JavaScript** - 无需额外框架

## 安装步骤

### 1. 安装 Neo4j

确保已安装并运行 Neo4j 数据库。可以从 [Neo4j 官网](https://neo4j.com/download/) 下载。

默认配置：
- 地址: `bolt://localhost:7687`
- 用户: `neo4j`
- 密码: 自行设置

### 2. 创建环境配置

复制 `.env.example` 为 `.env` 并根据你的配置修改：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=你的密码
```

### 3. 安装 Python 依赖

```bash
pip install -r requirements.txt
```

## 运行项目

```bash
python app.py
```

然后在浏览器访问: http://localhost:5000

## API 接口

### 1. 爬取包依赖
```
POST /api/scrape
Content-Type: application/json

{
    "package_name": "react",
    "version": "18.2.0",  // 可选
    "max_depth": 3        // 可选，默认 3
}
```

### 2. 获取包的依赖图
```
GET /api/graph/{package_name}/{version}
```

### 3. 检查包漏洞
```
GET /api/vulnerability/{package_name}/{version}
```

### 4. 获取包详情
```
GET /api/package/{package_name}/{version}
```

### 5. 清空数据库
```
POST /api/clear
```

## 使用说明

1. **输入包名**：在左侧面板输入要分析的 npm 包名（如: react, lodash）
2. **选择版本**（可选）：指定版本号，留空则使用最新版本
3. **设置深度**：选择依赖爬取的最大深度（1-5）
4. **点击爬取**：开始爬取依赖并生成可视化图
5. **交互操作**：
   - 鼠标滚轮：缩放视图
   - 拖拽节点：调整位置
   - 点击节点：查看包详情和漏洞信息
   - 右下角按钮：控制缩放

## 项目结构

```
.
├── app.py              # Flask 应用主入口
├── database.py         # Neo4j 数据库操作
├── npm_scraper.py      # npm 依赖爬取模块
├── cve_checker.py      # CVE 漏洞检测模块
├── config.py           # 配置文件
├── requirements.txt    # Python 依赖
├── .env.example        # 环境变量示例
├── static/
│   └── index.html     # 前端页面
└── README.md
```

## 图例说明

- 🟢 **绿色节点**：暂无已知漏洞的包
- 🔴 **红色节点**：存在已知漏洞的包
- **连接线**：表示依赖关系

## 注意事项

1. 爬取深度较大时可能需要较长时间
2. 漏洞检测依赖于 OSV API，可能受网络影响
3. 确保 Neo4j 数据库已正确配置并运行
4. 首次运行会自动创建必要的数据库索引和节点

## 许可证

MIT

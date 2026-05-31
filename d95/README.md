# 安全报告分析工具

使用 AI 分析 Nmap 扫描结果，生成专业的安全报告。

## ✨ 功能特性

- 🎯 **智能分析**: 使用 Ollama + Llama 3 深度分析扫描结果
- ⚡ **流式输出**: 实时显示分析进度，无需等待完整响应
- 💬 **多轮对话**: 支持针对报告内容的追问和深入探讨
- 📊 **专业报告**: 生成包含漏洞分析和修复建议的完整 Markdown 报告
- 💾 **导出功能**: 支持复制和导出报告文件
- 🎨 **精美界面**: 深色主题，现代化 UI 设计
- 📱 **响应式设计**: 支持桌面和移动端

## 🛠️ 技术栈

### 后端
- Node.js + Express
- TypeScript
- xml2js (XML 解析)
- Ollama JavaScript SDK
- 会话管理 (Session)

### 前端
- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- React Markdown + Syntax Highlighter
- Lucide React 图标库

## 📋 前置要求

1. Node.js 18+
2. Ollama (安装 Llama 3 模型)

### 安装 Ollama

```bash
# 下载并安装 Ollama
# https://ollama.ai/download

# 拉取 Llama 3 模型
ollama pull llama3
```

## 🚀 快速开始

### 方式一：使用启动脚本 (Windows)

```powershell
# 在项目根目录运行
.\start.ps1
```

### 方式二：手动启动

**1. 安装后端依赖并启动**
```bash
cd server
npm install
npm run dev
```

**2. 安装前端依赖并启动 (新开终端)**
```bash
cd client
npm install
npm run dev
```

**3. 访问应用**
- 前端: http://localhost:3000
- 后端: http://localhost:3001

## 💬 多轮对话功能

分析报告生成后，您可以在"智能对话"标签页进行追问：

**示例问题：**
- "请详细解释一下SQL注入的原理"
- "如何加固SSH服务？"
- "Apache有哪些常见的安全漏洞？"
- "如何配置更安全的HTTPS？"

**特点：**
- 上下文记忆：AI 会记住之前的对话内容
- 流式输出：实时显示回答内容
- Markdown 支持：支持代码块、列表等格式
- 会话管理：自动清理过期会话

## 🧪 测试 XML 解析器

```bash
cd server
npx tsx test-xml-parser.ts
```

## 📖 使用说明

1. 确保 Ollama 服务正在运行
2. 使用 Nmap 生成 XML 格式的扫描结果:
   ```bash
   nmap -oX scan.xml 192.168.1.0/24
   ```
3. 打开浏览器访问: http://localhost:3000
4. 上传生成的 scan.xml 文件
5. 等待 AI 分析并生成报告
6. 在"智能对话"标签页进行追问（可选）
7. 复制或导出 Markdown 格式的安全报告

## 📁 项目结构

```
d95/
├── client/                 # 前端 Next.js
│   ├── app/
│   │   ├── page.tsx       # 主页面
│   │   ├── layout.tsx     # 布局
│   │   └── globals.css    # 全局样式
│   ├── components/
│   │   ├── FileUpload.tsx       # 文件上传组件
│   │   ├── MarkdownRenderer.tsx # Markdown 渲染组件
│   │   └── ChatPanel.tsx        # 聊天面板组件
│   ├── lib/
│   │   └── api.ts         # API 客户端
│   └── package.json
├── server/                 # 后端 Express
│   ├── src/
│   │   ├── index.ts       # 服务入口
│   │   ├── routes/
│   │   │   └── analyze.ts # 分析路由
│   │   ├── services/
│   │   │   ├── xmlParser.ts  # XML 解析服务
│   │   │   └── ollama.ts     # Ollama 服务（含会话管理）
│   │   ├── types.ts       # 类型定义
│   │   └── test-xml-parser.ts # 测试脚本
│   └── package.json
├── example-scan.xml        # 示例 Nmap 扫描文件
├── start.ps1               # Windows 启动脚本
└── README.md
```

## 🔌 API 接口

### POST /api/analyze
上传 Nmap XML 文件，返回流式的 AI 分析报告。

**请求**: multipart/form-data
- `file`: XML 文件

**响应**: text/plain (流式)
**响应头**: `X-Session-Id` - 会话ID，用于后续对话

### POST /api/analyze/chat
与 AI 进行多轮对话。

**请求**: JSON
```json
{
  "sessionId": "session_xxx",
  "message": "请详细解释一下SQL注入的原理"
}
```

**响应**: text/plain (流式)

### DELETE /api/analyze/session/:sessionId
删除指定会话。

### GET /api/analyze/health
检查后端和 Ollama 连接状态。

### GET /api/health
检查后端服务健康状态。

## 🔧 修复内容

### 1. XML 解析问题
- ✅ 修复 `$` 属性访问问题
- ✅ 添加 `getAttributeValue` 辅助方法
- ✅ 正确处理 `mergeAttrs: false` 配置
- ✅ 增强错误处理和类型安全

### 2. 流式响应优化
- ✅ 添加正确的 `Transfer-Encoding: chunked` 头
- ✅ 实现 `res.flush()` 确保数据立即发送
- ✅ 增强 CORS 配置，暴露必要的响应头
- ✅ 添加流式错误处理

### 3. 多轮对话功能
- ✅ 实现会话管理（创建、获取、删除、自动清理）
- ✅ 添加对话 API 路由
- ✅ 创建聊天面板 UI 组件
- ✅ 实现流式对话输出
- ✅ 添加上下文记忆功能

### 4. 前端 Markdown 渲染
- ✅ 增强 Markdown 组件样式和动画
- ✅ 添加自动滚动到底部功能
- ✅ 完善错误状态显示
- ✅ 添加代码高亮和表格样式
- ✅ 支持 GFM (GitHub Flavored Markdown)

### 5. UI/UX 改进
- ✅ 添加标签页切换（报告/对话）
- ✅ 显示会话状态
- ✅ 优化聊天消息展示样式
- ✅ 添加对话清空功能

## 📝 常见问题

### 1. Ollama 连接失败
确保 Ollama 服务正在运行:
```bash
ollama list
```

### 2. 前端无法连接后端
- 检查后端是否在端口 3001 运行
- 确认 CORS 配置正确
- 查看浏览器控制台的错误信息

### 3. XML 解析错误
- 确保上传的是标准的 Nmap XML 输出文件
- 检查文件是否完整且格式正确

### 4. 会话过期
会话默认 1 小时后自动清理，如需继续对话请重新上传文件。

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

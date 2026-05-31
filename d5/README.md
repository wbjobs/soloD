# 本地知识库问答系统

基于 LangChain + Chroma + OpenAI Embeddings + FastAPI + Vue 3 开发的本地知识库问答系统。

## ✨ 功能特性

### 后端
- ✅ 文档上传和解析，支持 PDF、Word、TXT 格式
- ✅ 文档向量化存储（Chroma + OpenAI Embeddings）
- ✅ 基于 RAG 的问答接口
- ✅ 对话记忆管理，支持设置上下文窗口大小
- ✅ 知识库增量更新，支持文档更新
- ✅ 问答评分和反馈系统
- ✅ 支持多会话管理

### 前端
- ✅ 知识库文档管理（上传、删除、更新）
- ✅ 对话页面，支持多轮对话
- ✅ 引用来源展示，可查看对应原文片段
- ✅ 问答评分和反馈功能
- ✅ 上下文窗口大小设置
- ✅ 知识库统计面板

## 🛠 技术栈

### 后端
- **FastAPI**: Web 框架
- **LangChain**: LLM 应用框架
- **Chroma**: 向量数据库
- **OpenAI Embeddings**: 文本向量化
- **pdfplumber**: PDF 解析（更稳定的乱码修复）
- **python-docx**: Word 文档解析
- **chardet**: 字符编码检测

### 前端
- **Vue 3**: 前端框架
- **Element Plus**: UI 组件库
- **Vue Router**: 路由管理
- **Axios**: HTTP 客户端
- **Marked**: Markdown 渲染

## 📁 项目结构

```
d5/
├── backend/                 # 后端服务
│   ├── main.py             # FastAPI 主应用
│   ├── config.py           # 配置文件
│   ├── document_parser.py  # 文档解析模块（乱码修复版）
│   ├── vector_store.py     # 向量存储服务
│   ├── rag_service.py      # RAG 问答服务（含记忆和反馈）
│   ├── requirements.txt    # Python 依赖
│   └── .env.example        # 环境变量示例
├── frontend/               # 前端应用
│   ├── src/
│   │   ├── main.js        # 入口文件
│   │   ├── App.vue        # 根组件
│   │   ├── router/        # 路由配置
│   │   ├── views/         # 页面组件
│   │   └── api/           # API 封装
│   ├── package.json       # Node 依赖
│   └── vite.config.js     # Vite 配置
└── README.md              # 项目说明
```

## 🚀 快速开始

### 1. 克隆项目

```bash
cd d5
```

### 2. 配置后端

#### 安装 Python 依赖

```bash
cd backend
pip install -r requirements.txt
```

#### 配置环境变量

复制 `.env.example` 为 `.env` 并修改配置：

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_BASE_URL=https://api.openai.com/v1
CHROMA_PERSIST_DIRECTORY=./chroma_db
UPLOAD_DIRECTORY=./uploads
MAX_FILE_SIZE=10485760
```

### 3. 启动后端服务

```bash
cd backend
python main.py
```

后端服务将在 `http://localhost:8000` 启动

API 文档地址：`http://localhost:8000/docs`

### 4. 配置前端

#### 安装 Node 依赖

```bash
cd frontend
npm install
```

### 5. 启动前端开发服务器

```bash
cd frontend
npm run dev
```

前端服务将在 `http://localhost:3000` 启动

## 📖 使用说明

### 1. 上传文档

1. 点击左侧菜单的「知识库」
2. 拖放文件到上传区域，或点击上传
3. 支持格式：PDF、DOCX、TXT
4. 文件大小限制：10MB

### 2. 更新文档

- 在文档列表中点击「更新」按钮
- 选择新的文档文件即可增量更新

### 3. 开始对话

1. 点击左侧菜单的「对话」
2. 在输入框中输入问题
3. 按 Enter 或点击发送按钮
4. 系统会基于知识库内容给出回答

### 4. 上下文窗口设置

- 在对话页面顶部选择上下文窗口大小
- 支持 2-20 轮对话记忆
- 较大的窗口可以保持更长的对话上下文

### 5. 问答反馈

- 每个AI回答下方都有评分组件
- 可以对回答进行 1-5 星评分
- 可选填写反馈意见
- 反馈数据会持久化存储用于质量优化

### 6. 查看引用来源

- AI 回答下方会显示「引用来源」区域
- 点击展开可查看对应的原文片段和页码

## 📦 生产部署

### 后端部署（使用 uvicorn）

```bash
cd backend
pip install gunicorn uvicorn
gunicorn main:app --workers 4 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

### 前端部署

```bash
cd frontend
npm run build
```

构建产物在 `dist` 目录，可部署到 Nginx 等静态文件服务器。

### Nginx 配置示例

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态文件
    location / {
        root /path/to/frontend/dist;
        try_files $uri $uri/ /index.html;
    }

    # API 代理
    location /api {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## ⚙️ 配置说明

### 后端配置项

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| OPENAI_API_KEY | OpenAI API 密钥 | 必填 |
| OPENAI_BASE_URL | OpenAI API 地址 | https://api.openai.com/v1 |
| CHROMA_PERSIST_DIRECTORY | Chroma 数据目录 | ./chroma_db |
| UPLOAD_DIRECTORY | 上传文件目录 | ./uploads |
| MAX_FILE_SIZE | 最大文件大小（字节） | 10485760 (10MB) |
| CHUNK_SIZE | 文本分块大小 | 500 |
| CHUNK_OVERLAP | 分块重叠大小 | 50 |

## 🔧 开发说明

### 添加新的文件格式支持

在 `backend/document_parser.py` 中添加新的解析方法：

```python
@staticmethod
def _parse_xxx(file_path: str) -> List[Document]:
    # 实现解析逻辑
    pass
```

### 自定义提示词

在 `backend/rag_service.py` 的 `_setup_chain` 方法中修改：

```python
system_prompt = (
    "你的自定义提示词..."
    "{context}"
)
```

### 调整RAG检索参数

修改 `rag_service.py` 中的检索器配置：

```python
self.retriever = vector_store_service.vector_store.as_retriever(
    search_kwargs={"k": 5}  # 调整返回的文档数量
)
```

## 🐛 问题修复记录

### 1. PDF 乱码问题

- **问题**: 使用 PyPDF2 提取中文 PDF 时出现乱码
- **解决**: 切换到 pdfplumber 库，支持更好的中文编码
- **优化**: 添加了文本清理函数，去除乱码字符

### 2. 问答幻觉问题

- **问题**: 模型会编造知识库之外的信息
- **解决**: 
  - 降低 temperature 从 0.7 到 0.1
  - 强化提示词，明确要求只使用上下文信息
  - 增加检索返回的文档块数量从 3 到 5
  - 提示词中明确说明如果不知道就坦诚回答

## 📝 注意事项

1. 首次运行会自动创建 `chroma_db` 和 `uploads` 目录
2. 向量数据存储在本地，可随时删除重建
3. 请妥善保管 OpenAI API Key，不要提交到代码仓库
4. 大文件上传可能需要较长时间，请耐心等待
5. 反馈数据存储在 `feedback_data.json` 文件中

## 📄 许可证

MIT

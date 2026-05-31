# Git Commit AI - 智能提交信息生成器

一个CLI工具，自动读取Git暂存区的变更内容，通过本地LLM生成符合Conventional Commits规范的提交信息。

## 功能特性

- 🔍 自动读取Git暂存区的diff内容
- 🤖 通过本地LLM智能分析代码变更
- 📝 生成符合Conventional Commits规范的提交信息
- ✅ 用户交互确认机制
- 🚀 支持Dry-run模式预览

## 安装

```bash
pip install -r requirements.txt
```

## 前置要求

1. 本地部署Ollama服务 (默认端口: 11434)
2. 已拉取并运行LLM模型 (默认: qwen2.5-coder:7b)

### Ollama快速安装

```bash
# Windows (使用PowerShell)
winget install Ollama.Ollama

# 拉取模型
ollama pull qwen2.5-coder:7b
```

## 使用方法

### 基本使用

```bash
# 1. 添加文件到暂存区
git add .

# 2. 运行工具生成提交信息
python git_commit_ai.py
```

### 命令行选项

```bash
# 仅预览生成的提交信息，不实际提交
python git_commit_ai.py --dry-run

# 自动确认提交，无需交互
python git_commit_ai.py --yes

# 指定自定义LLM接口地址
python git_commit_ai.py --llm-url http://localhost:11434/api/generate

# 指定使用的模型
python git_commit_ai.py --model qwen2.5-coder:14b
```

## Conventional Commits 类型

| 类型 | 说明 |
|------|------|
| feat | 新功能 |
| fix | Bug修复 |
| docs | 文档更新 |
| style | 代码格式调整 |
| refactor | 代码重构 |
| test | 测试相关 |
| chore | 构建/工具链相关 |

## 示例

```
$ git add git_commit_ai.py
$ python git_commit_ai.py
正在分析代码变更...

生成的提交信息:
--------------------------------------------------
feat(commit): 添加智能提交信息生成功能
--------------------------------------------------

是否使用此提交信息进行提交? [Y/n]: y

✅ 提交成功!
```

## 配置

默认配置可以通过命令行参数覆盖：

- **LLM_URL**: `http://localhost:11434/api/generate`
- **DEFAULT_MODEL**: `qwen2.5-coder:7b`

## 许可证

MIT License

# Markdown Notes - 跨平台Markdown笔记与知识库管理工具

一个基于 Tauri + Rust + React + TypeScript 开发的跨平台桌面应用，用于管理和编辑 Markdown 笔记。

## 功能特性

### 1. 本地 Markdown 文件管理
- 支持文件夹选择和文件目录树展示
- 文件/文件夹创建、删除、重命名
- 实时文件系统监控

### 2. Markdown 实时预览
- 支持 GitHub Flavored Markdown (GFM)
- 语法高亮 (Prism)
- 数学公式渲染 (KaTeX)
- 表格、任务列表、引用等高级语法支持

### 3. 全文搜索
- 支持关键词搜索
- 搜索结果高亮显示
- 实时搜索匹配

### 4. 标签管理与分类
- 笔记标签系统
- 笔记分类功能
- 按标签/分类筛选

### 5. 版本历史管理
- 自动保存版本历史
- 版本对比（差异显示）
- 版本回退功能

## 技术栈

### 前端
- React 18 + TypeScript
- Vite (构建工具)
- Tailwind CSS (样式框架)
- react-markdown (Markdown 渲染)
- react-syntax-highlighter (代码高亮)
- KaTeX (数学公式)
- Lucide React (图标)

### 后端
- Rust (系统编程语言)
- Tauri (桌面应用框架)
- walkdir (文件遍历)
- serde (序列化/反序列化)
- uuid (唯一标识符)
- chrono (时间处理)
- regex (正则表达式)

## 开发环境要求

- Node.js >= 18.0.0
- Rust >= 1.70.0
- 操作系统: Windows 10+ / macOS 11+ / Linux

## 安装与运行

### 1. 安装依赖
```bash
npm install
```

### 2. 开发模式运行
```bash
npm run tauri dev
```

### 3. 构建生产版本
```bash
npm run tauri build
```

## 项目结构

```
markdown-notes/
├── src/                          # 前端源代码
│   ├── components/              # React 组件
│   │   ├── Sidebar.tsx         # 侧边栏（搜索、标签、分类）
│   │   ├── FileTree.tsx        # 文件目录树
│   │   ├── Editor.tsx          # Markdown 编辑器
│   │   └── MarkdownPreview.tsx # Markdown 预览
│   ├── services/               # 服务层
│   │   └── tauri.ts           # Tauri API 封装
│   ├── types/                  # TypeScript 类型定义
│   │   └── index.ts
│   ├── App.tsx                 # 主应用组件
│   ├── main.tsx               # 应用入口
│   └── index.css              # 全局样式
├── src-tauri/                 # Tauri Rust 后端
│   ├── src/
│   │   └── main.rs           # Rust 主程序
│   ├── icons/                 # 应用图标
│   ├── Cargo.toml            # Rust 依赖配置
│   ├── tauri.conf.json       # Tauri 配置
│   └── build.rs              # 构建脚本
├── index.html                 # HTML 模板
├── package.json               # Node.js 依赖配置
├── tsconfig.json              # TypeScript 配置
├── vite.config.ts             # Vite 配置
├── tailwind.config.js         # Tailwind CSS 配置
└── postcss.config.js          # PostCSS 配置
```

## 使用说明

### 首次使用
1. 启动应用后，点击"打开文件夹"按钮选择你的笔记目录
2. 应用会自动扫描目录中的 Markdown 文件
3. 在左侧文件树中点击文件即可打开

### 创建笔记
- 点击"新建笔记"按钮创建新的 Markdown 文件
- 点击"新建文件夹"按钮创建新目录

### 编辑与预览
- 左侧为编辑区域，右侧为实时预览
- 点击顶部"预览模式"按钮可切换编辑/预览视图
- 支持标准 Markdown 语法及扩展语法

### 版本管理
- 点击顶部"版本历史"按钮查看所有版本
- 点击版本项可查看与当前版本的差异
- 点击恢复按钮可回退到指定版本

### 搜索功能
- 在左侧搜索框输入关键词
- 按回车键开始搜索
- 搜索结果会在预览区域高亮显示

### 标签与分类
- 在编辑区域顶部可添加/删除标签
- 选择笔记的分类类别
- 在左侧边栏可按标签或分类筛选笔记

## 支持的 Markdown 语法

### 基础语法
- 标题 (H1-H6)
- 粗体和斜体
- 有序和无序列表
- 链接和图片
- 代码块和行内代码
- 引用块
- 水平分割线

### 扩展语法 (GFM)
- 表格
- 任务列表
- 删除线
- 自动链接
- 脚注

### 数学公式
支持 LaTeX 数学公式语法：
- 行内公式: `$E = mc^2$`
- 块级公式:
  ```
  $$
  \frac{\partial u}{\partial t} = \Delta u + f(u)
  $$
  ```

## 配置说明

### 应用配置 (tauri.conf.json)
- `identifier`: 应用唯一标识符
- `productName`: 应用名称
- `version`: 版本号
- `windows`: 窗口配置（大小、标题等）
- `allowlist`: API 权限配置

### 样式配置 (tailwind.config.js)
可自定义主题颜色、字体、间距等。

## 打包说明

### Windows
- 输出格式: `.msi` 安装程序
- 默认输出目录: `src-tauri/target/release/bundle/msi/`

### macOS
- 输出格式: `.dmg` 磁盘镜像
- 默认输出目录: `src-tauri/target/release/bundle/dmg/`

### Linux
- 输出格式: `.deb` 和 `.AppImage`
- 默认输出目录: `src-tauri/target/release/bundle/`

## 开发注意事项

1. **Rust 依赖**: 首次运行时会下载编译 Rust 依赖，可能需要较长时间
2. **WebView2**: Windows 平台需要安装 WebView2 Runtime（Windows 11 已预装）
3. **文件权限**: 确保应用有足够的文件读写权限
4. **版本数据**: 版本历史存储在应用数据目录下的 `.versions` 文件夹中

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
# 串口终端应用

一个基于 Electron + React 的跨平台串口调试工具，支持串口通信和数据持久化存储。

## 功能特性

- **串口管理**
  - 自动扫描系统可用串口
  - 支持自定义波特率
  - 实时连接状态显示

- **终端界面**
  - 发送十六进制指令
  - 实时显示接收数据
  - 发送/接收数据区分显示
  - 时间戳记录

- **数据持久化**
  - SQLite 本地数据库存储
  - 按时间范围查询历史记录
  - 支持最多 100 条记录分页

- **跨平台支持**
  - Windows
  - macOS
  - Linux

## 技术栈

- **前端框架**: React 18 + TypeScript
- **构建工具**: Vite
- **桌面框架**: Electron
- **串口通信**: serialport
- **数据库**: better-sqlite3

## 安装依赖

```bash
npm install
```

## 开发运行

```bash
# 开发模式（热重载）
npm run dev

# 生产构建
npm run build
```

## 项目结构

```
.
├── src/
│   ├── main/              # Electron 主进程
│   │   ├── main.ts        # 主进程入口
│   │   ├── preload.ts     # 预加载脚本
│   │   ├── serial.ts      # 串口管理
│   │   └── database.ts    # 数据库管理
│   └── renderer/          # React 渲染进程
│       ├── index.html
│       └── src/
│           ├── main.tsx   # React 入口
│           ├── App.tsx    # 主组件
│           └── index.css  # 样式文件
├── package.json
├── tsconfig.json
├── tsconfig.main.json
└── vite.config.ts
```

## 使用说明

1. **连接串口**
   - 从下拉列表选择串口
   - 设置波特率（默认 9600）
   - 点击"连接"按钮

2. **发送数据**
   - 在输入框输入十六进制数据（如: 01 02 03）
   - 点击"发送"按钮或按 Enter 键

3. **查询历史**
   - 选择开始时间和结束时间
   - 点击"查询"按钮查看历史记录

## 打包发布

```bash
# 安装 electron-builder（如未安装）
npm install -g electron-builder

# 打包（根据当前系统自动选择）
npm run build
electron-builder
```

## 注意事项

- 串口需要相应的系统权限
- Windows 系统可能需要安装串口驱动
- 数据库文件位于用户数据目录下

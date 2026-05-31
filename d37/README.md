# 传感器数据采集系统

一个基于 Electron + Vue 的跨平台桌面应用，用于读取串口传感器数据并进行实时展示和存储。

## 功能特性

- **串口通信**: 通过 Node-SerialPort 连接串口设备
- **实时数据展示**: 使用 Chart.js 展示温度、湿度、电压的实时波形图
- **数据存储**: 使用 SQLite 本地数据库存储采集数据
- **CSV导出**: 支持将历史数据导出为 CSV 文件
- **模拟数据**: 内置模拟数据生成功能，方便测试

## 技术栈

- **Electron**: 跨平台桌面应用框架
- **Vue 3**: 前端框架
- **Chart.js + vue-chartjs**: 图表库
- **Node-SerialPort**: 串口通信库
- **better-sqlite3**: SQLite 数据库
- **csv-writer**: CSV 文件导出

## 安装依赖

```bash
npm install
```

## 运行应用

### 开发模式

```bash
npm run dev
```

然后在另一个终端运行：

```bash
npm run electron
```

或者使用 concurrently 一键运行：

```bash
npm run electron:dev
```

### 打包应用

```bash
npm run build
npm run electron:build
```

## 使用说明

### 1. 串口连接

1. 点击"刷新串口"按钮获取可用串口列表
2. 选择要连接的串口和波特率（默认 9600）
3. 点击"连接"按钮建立连接

### 2. 数据采集

1. 点击"开始采集"按钮开始记录数据到数据库
2. 点击"停止采集"按钮停止数据记录
3. 勾选"使用模拟数据"可以在没有真实设备时测试功能

### 3. 数据导出

1. 点击"导出CSV"按钮
2. 选择保存位置和文件名
3. 所有历史数据将被导出为 CSV 文件

## 传感器数据格式

串口设备应按以下 JSON 格式发送数据：

```json
{"temperature": 25.5, "humidity": 60.2, "voltage": 5.0}
```

每行发送一条数据，以换行符结束。

## 项目结构

```
.
├── electron/
│   ├── main.js          # Electron 主进程
│   └── preload.js       # 预加载脚本
├── src/
│   ├── App.vue          # 主应用组件
│   ├── main.js          # Vue 入口文件
│   └── style.css        # 样式文件
├── index.html           # HTML 模板
├── vite.config.js       # Vite 配置
└── package.json         # 项目配置
```

## 注意事项

1. 首次运行需要重建原生模块（serialport 和 better-sqlite3）
2. Windows 系统可能需要安装 Windows Build Tools
3. 串口权限问题：Linux/macOS 系统可能需要添加用户到 dialout 组

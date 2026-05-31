# 电路噪声分析器 (Circuit Noise Analyzer)

一个基于 Electron + React + Node.js C++ 扩展的桌面应用，用于分析模拟电路的噪声特性。

## 功能特性

- **可视化电路图编辑器**：拖拽式添加电路元件
- **元件库**：支持电阻、电容、运放、电压源、接地
- **连线功能**：点击元件端点进行连线
- **噪声分析**：
  - 电阻热噪声 (Johnson-Nyquist noise)
  - 运放电压噪声（含 1/f 噪声）
  - 运放电流噪声
- **噪声谱密度图**：使用对数刻度展示频率响应
- **属性面板**：修改元件参数和噪声特性

## 技术栈

- **前端**：React 18 + Recharts（图表）
- **桌面框架**：Electron
- **后端**：Node.js
- **C++ 扩展**：Node-API (N-API)
- **构建工具**：Webpack + node-gyp

## 项目结构

```
circuit-noise-analyzer/
├── electron/
│   ├── main.js                    # Electron 主进程
│   └── noise_calculator_fallback.js # JavaScript fallback
├── src/
│   ├── components/
│   │   ├── CircuitEditor.js       # 电路图编辑器
│   │   ├── CircuitElement.js      # 电路元件组件
│   │   ├── ComponentLibrary.js    # 元件库面板
│   │   ├── PropertiesPanel.js     # 属性面板
│   │   └── NoiseChart.js          # 噪声图表
│   ├── App.js
│   ├── index.js
│   └── styles.css
├── cpp/
│   ├── include/
│   │   └── circuit_elements.h     # C++ 元件类定义
│   └── src/
│       ├── circuit_elements.cpp   # 元件实现
│       └── noise_calculator.cpp   # N-API 绑定
├── public/
│   └── index.html
├── binding.gyp                    # node-gyp 配置
├── webpack.config.js
└── package.json
```

## 安装与运行

### 前置要求

- Node.js 16+
- Python 3.7+ (用于编译 C++ 扩展)
- Visual Studio (Windows) / Xcode (macOS) / build-essential (Linux)

### 安装依赖

```bash
npm install
```

### 编译 C++ 扩展

```bash
npm run build:addon
```

### 运行开发模式

```bash
npm start
```

### 构建生产版本

```bash
npm run build
npm run package
```

## 使用说明

1. **添加元件**：从左侧元件库拖拽元件到画布
2. **移动元件**：在画布上拖拽元件
3. **编辑属性**：点击元件选中后，在右侧属性面板修改参数
4. **连接元件**：点击元件的端点（橙色圆点），再点击另一个元件的端点
5. **计算噪声**：点击工具栏的"计算噪声"按钮
6. **查看结果**：底部将显示噪声谱密度图

## 噪声模型

### 电阻热噪声

$$ V_n^2 = 4kTR $$

其中：
- k = 1.380649 × 10⁻²³ J/K (玻尔兹曼常数)
- T = 绝对温度 (K)
- R = 电阻值 (Ω)

### 运放噪声

- **电压噪声**：$ V_n(f) = V_{n,white} \times \sqrt{1 + \frac{f_c}{f}} $
- **电流噪声**：$ I_n(f) = I_{n,white} \times \sqrt{1 + \frac{f_c}{f}} $

其中 fc 为转角频率。

## 许可证

MIT

# Wasm 图像处理应用

基于 Rust WebAssembly 和 Vite + TypeScript 构建的浏览器图像处理应用。

## 功能特性

- **三种图像滤镜算法**（Rust 实现）：
  - 灰度化 (Grayscale) - 使用 ITU-R BT.601 标准
  - 反色 (Invert) - 反转每个颜色通道
  - 复古效果 (Sepia) - 经典棕褐色调

- **前端功能**：
  - 文件上传组件
  - Canvas 图像显示（自动缩放）
  - 实时滤镜处理
  - 处理性能计时
  - 错误处理和状态显示

## 项目结构

```
d14/
├── src/
│   └── lib.rs          # Rust 滤镜算法实现
├── pkg/                # Wasm 构建输出（自动生成）
│   ├── image_filters.js
│   ├── image_filters_bg.wasm
│   └── image_filters.d.ts
├── src/
│   ├── main.ts         # 前端主逻辑
│   └── style.css       # 样式文件
├── index.html          # HTML 入口
├── vite.config.ts      # Vite 配置
├── tsconfig.json       # TypeScript 配置
├── package.json        # 前端依赖配置
├── Cargo.toml          # Rust 项目配置
└── build.ps1           # Windows 构建脚本
```

## 快速开始

### Windows 用户

直接运行构建脚本：

```powershell
.\build.ps1
```

### 手动构建步骤

#### 1. 前置要求

- Rust (https://rustup.rs/)
- wasm-pack: `cargo install wasm-pack`
- Node.js (https://nodejs.org/)

#### 2. 构建 Rust Wasm 模块

```bash
wasm-pack build --target web --out-dir pkg
```

这会在 `pkg/` 目录下生成：
- `image_filters_bg.wasm` - 编译后的 Wasm 模块
- `image_filters.js` - JS 胶水代码
- `image_filters.d.ts` - TypeScript 类型定义

#### 3. 安装前端依赖

```bash
npm install
```

#### 4. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:3000

#### 5. 构建生产版本

```bash
npm run build
```

## 使用说明

1. 点击"选择图片"按钮上传一张图片（支持 JPG、PNG 等格式）
2. 图片会自动缩放到适合 Canvas 显示的尺寸（最大 800x600）
3. 点击相应的滤镜按钮应用效果：
   - **原图**：恢复原始图片
   - **灰度化**：将图片转为黑白效果
   - **反色**：反转图片颜色
   - **复古**：应用复古棕褐色效果
4. 状态栏会显示处理耗时（毫秒）

## 技术实现细节

### Rust 图像处理

- 使用高阶函数 `process_pixels` 统一处理像素遍历
- 包含边界检查，确保能安全处理任意尺寸的图像
- 原地修改像素数据，避免额外内存分配
- 使用 `wee_alloc` 作为轻量级内存分配器
- Release 模式启用 LTO 优化，减小 Wasm 体积

### TypeScript 前端

- 正确的 Wasm 模块导入（使用 `--target web` 模式）
- 类型安全的 Wasm 函数调用
- Canvas ImageData 与 Wasm 内存直接交互
- 图片自动缩放，避免 Canvas 过大
- 完善的错误处理和状态显示

## 技术栈

- **Rust + wasm-bindgen**：核心图像处理逻辑
- **WebAssembly**：高性能浏览器执行
- **TypeScript**：类型安全的前端代码
- **Vite**：快速开发构建工具（原生支持 Wasm）
- **Canvas API**：浏览器图像操作

# 图像隐写工具 - Vite + Svelte + Rust/Wasm 完整配置

这是一个完整的、可运行的图像隐写工具项目，展示了如何正确配置和使用 Rust WebAssembly 与 Svelte + Vite。

---

## 📋 项目结构

```
.
├── steganography/              # Rust 库项目
│   ├── src/
│   │   └── lib.rs             # 核心隐写算法（使用 image crate）
│   └── Cargo.toml             # Rust 依赖配置
├── src/
│   ├── App.svelte             # 主应用组件
│   ├── main.js                # 应用入口
│   ├── wasmLoader.js          # ✅ WASM 加载和工具函数（关键文件）
│   └── pkg/                   # wasm-pack 编译输出目录
│       ├── steganography.js
│       ├── steganography_bg.wasm
│       └── ...
├── index.html
├── vite.config.js             # ✅ Vite 配置
├── svelte.config.js           # ✅ Svelte 配置
├── package.json               # ✅ 项目依赖和脚本
└── README.md
```

---

## 🚀 快速开始

### 1. 安装前端依赖

```bash
npm install
```

### 2. 编译 Rust 为 WebAssembly

#### 前置要求：

- 安装 Rust: https://rustup.rs/
- 安装 wasm-pack: `cargo install wasm-pack`

#### 编译命令：

```bash
# 进入 Rust 项目目录
cd steganography

# 编译为 web 目标，输出到 ../src/pkg 目录
wasm-pack build --target web --out-dir ../src/pkg

# 或者使用项目根目录的 npm 脚本
cd ..
npm run build:wasm
```

### 3. 启动开发服务器

```bash
npm run dev
```

浏览器访问: http://localhost:3000

### 4. 生产构建

```bash
npm run build
```

---

## ✅ 关键配置详解

### 1. Rust 项目配置 (`steganography/Cargo.toml`)

```toml
[package]
name = "steganography"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]  # 编译为 C 动态库，WASM 必需

[dependencies]
wasm-bindgen = "0.2"
image = { version = "0.24", features = ["png", "jpeg", "bmp"] }
console_error_panic_hook = "0.1"
```

### 2. Rust 代码关键点 (`steganography/src/lib.rs`)

```rust
use wasm_bindgen::prelude::*;
use image::{ImageBuffer, DynamicImage, ImageOutputFormat};

// ✅ 使用 Result 返回错误，而不是 panic
#[wasm_bindgen]
pub fn encode_image(carrier: &[u8], secret: &str) -> Result<Vec<u8>, String> {
    // 使用 image crate 加载图片
    let img = image::load_from_memory(carrier)
        .map_err(|e| format!("Failed to load image: {}", e))?;
    
    let rgba = img.to_rgba8();
    // ... 隐写算法 ...
    
    // 输出为 PNG 格式
    let mut output = Vec::new();
    DynamicImage::ImageRgba8(rgba)
        .write_to(&mut Cursor::new(&mut output), ImageOutputFormat::Png)
        .map_err(|e| format!("Failed to write image: {}", e))?;
    
    Ok(output)
}
```

### 3. File → Uint8Array 转换 (`src/wasmLoader.js`)

```javascript
/**
 * ✅ 正确的 File 转 Uint8Array 方法
 */
export async function fileToUint8Array(file) {
  if (!(file instanceof File)) {
    throw new Error('参数必须是 File 对象');
  }

  // 方法 1: 现代浏览器推荐 - 使用 arrayBuffer()
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  // 方法 2: 兼容旧浏览器 - 使用 FileReader
  // const uint8Array = await new Promise((resolve, reject) => {
  //   const reader = new FileReader();
  //   reader.onload = (e) => resolve(new Uint8Array(e.target.result));
  //   reader.onerror = reject;
  //   reader.readAsArrayBuffer(file);
  // });

  return uint8Array;
}
```

### 4. WASM 模块加载 (`src/wasmLoader.js`)

```javascript
let wasmModule = null;

export async function loadWasm() {
  if (wasmModule) {
    return wasmModule;  // 缓存已加载的模块
  }

  try {
    // ✅ 使用 wasm-pack 的 --target web 输出
    const module = await import('./pkg/steganography.js');
    await module.default();  // 初始化 WASM 运行时
    wasmModule = module;
    return module;
  } catch (error) {
    console.error('WASM 加载失败:', error);
    throw error;
  }
}
```

### 5. Vite 配置 (`vite.config.js`)

```javascript
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  build: {
    target: 'esnext',
    assetsInlineLimit: 0,  // 不内联 WASM 文件
  },
  server: {
    port: 3000,
    headers: {
      // 如果需要 SharedArrayBuffer
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  }
});
```

### 6. package.json 脚本

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "build:wasm": "cd steganography && wasm-pack build --target web --out-dir ../src/pkg"
  },
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "^3.0.0",
    "svelte": "^4.2.0",
    "vite": "^5.0.0"
  }
}
```

---

## 🎯 使用示例

### 编码（隐藏信息）

```javascript
import { encodeImage, bytesToBlobUrl, downloadBlobUrl } from './wasmLoader.js';

// 假设 carrierFile 是 input[type=file] 获取的 File 对象
// 假设 secretText 是要隐藏的文本

async function encode() {
  try {
    // 1. 调用 WASM 编码函数
    const resultBytes = await encodeImage(carrierFile, secretText);
    
    // 2. 转换为 Blob URL 用于预览
    const blobUrl = bytesToBlobUrl(resultBytes);
    
    // 3. 下载文件
    downloadBlobUrl(blobUrl, 'stego_image.png');
  } catch (err) {
    console.error('编码失败:', err);
  }
}
```

### 解码（提取信息）

```javascript
import { decodeImage } from './wasmLoader.js';

async function decode() {
  try {
    // stegoFile 是隐写图片的 File 对象
    const secret = await decodeImage(stegoFile);
    console.log('提取的秘密文本:', secret);
  } catch (err) {
    console.error('解码失败:', err);
  }
}
```

---

## 🔍 常见问题

### Q1: WASM 加载失败 "module not found"

**A:** 确保已运行 `npm run build:wasm` 编译 Rust 代码，检查 `src/pkg` 目录是否存在。

### Q2: 图片加载失败 "image format not supported"

**A:** 确保 `Cargo.toml` 中 image crate 启用了对应的格式 feature：
```toml
image = { version = "0.24", features = ["png", "jpeg", "bmp", "gif"] }
```

### Q3: Result 类型在 JS 中如何处理？

**A:** wasm-bindgen 会自动将 Rust 的 `Result<T, E>` 转换为：
- Ok(value) → 返回 value
- Err(error) → 抛出 JS Error

### Q4: 如何调试 WASM 代码？

**A:** 
1. 使用 `console_error_panic_hook` 捕获 panic
2. 在浏览器开发者工具的 Sources 面板查看 WASM
3. 使用 console.log 输出调试信息（通过 web-sys）

### Q5: Vite 热更新时 WASM 重新加载？

**A:** 在 `wasmLoader.js` 中使用单例模式缓存已加载的 WASM 模块：
```javascript
let wasmModule = null;  // 缓存

export async function loadWasm() {
  if (wasmModule) return wasmModule;  // 避免重复加载
  // ... 加载逻辑 ...
}
```

---

## 📚 参考资源

- wasm-bindgen 文档: https://rustwasm.github.io/docs/wasm-bindgen/
- wasm-pack 文档: https://rustwasm.github.io/docs/wasm-pack/
- Rust image crate: https://docs.rs/image/
- Vite 文档: https://vitejs.dev/
- Svelte 文档: https://svelte.dev/

---

## ✨ 项目特点

1. ✅ **正确的 WASM 加载方式** - 使用 wasm-pack --target web
2. ✅ **File → Uint8Array 转换** - 两种实现方法
3. ✅ **Rust Result 错误处理** - 不使用 panic，友好的错误信息
4. ✅ **完整的 image crate 使用** - 正确处理各种图像格式
5. ✅ **Vite 优化配置** - 确保 WASM 文件被正确处理
6. ✅ **完整的前端 UI** - Svelte 组件，编码解码功能
7. ✅ **内存泄漏防护** - URL.revokeObjectURL 资源清理

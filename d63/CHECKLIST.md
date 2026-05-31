# ✅ 项目修复和验证清单

## 已修复的问题

### 1. ✅ Rust 代码改进 (`steganography/src/lib.rs`)
- 使用 `Result<Vec<u8>, String>` 替代 panic
- 正确使用 image crate 的 `ImageBuffer` 和 `DynamicImage`
- 添加了 `console_error_panic_hook` 用于调试
- 修正了像素访问方式（按字节索引访问 RGBA）

### 2. ✅ 新增 WASM 加载工具 (`src/wasmLoader.js`)
- 单例模式缓存已加载的 WASM 模块
- 提供 `fileToUint8Array()` 函数，两种实现方法
- 封装 `encodeImage()` 和 `decodeImage()` 函数
- 提供 `bytesToBlobUrl()` 和 `downloadBlobUrl()` 工具

### 3. ✅ 前端组件改进 (`src/App.svelte`)
- 使用 `wasmLoader.js` 中的工具函数
- 改进了错误处理和用户提示
- 添加了 `onDestroy` 钩子清理 URL 对象
- 更好的加载状态管理

### 4. ✅ Vite 配置改进 (`vite.config.js`)
- `assetsInlineLimit: 0` 确保 WASM 不被内联
- `target: 'esnext'` 支持最新的 JS 特性
- 添加了跨域隔离头（可选，用于 SharedArrayBuffer）

### 5. ✅ 项目依赖配置 (`package.json`)
- 正确的 Svelte + Vite 依赖
- `build:wasm` 脚本自动编译 Rust 到正确位置

---

## 📋 验证步骤

### 步骤 1: 安装依赖
```bash
npm install
```

### 步骤 2: 编译 WASM
```bash
npm run build:wasm
```
**验证:** 检查 `src/pkg/` 目录是否包含：
- `steganography.js`
- `steganography_bg.wasm`
- `steganography_bg.wasm.d.ts` (如果启用了 typescript)

### 步骤 3: 启动开发服务器
```bash
npm run dev
```
**验证:** 浏览器访问 http://localhost:3000

### 步骤 4: 测试编码功能
1. 选择一张图片 (PNG/JPG/BMP)
2. 输入秘密文本
3. 点击"开始编码"
4. 验证是否成功生成隐写图片

### 步骤 5: 测试解码功能
1. 选择刚才生成的隐写图片
2. 点击"开始解码"
3. 验证是否成功提取出秘密文本

---

## 🔧 关键代码片段参考

### Rust 函数签名
```rust
#[wasm_bindgen]
pub fn encode_image(carrier: &[u8], secret: &str) -> Result<Vec<u8>, String>

#[wasm_bindgen]
pub fn decode_image(stego: &[u8]) -> Result<String, String>
```

### JavaScript 调用方式
```javascript
// File → Uint8Array 转换
const arrayBuffer = await file.arrayBuffer();
const uint8Array = new Uint8Array(arrayBuffer);

// 调用 WASM 函数
const result = wasm.encode_image(uint8Array, "secret message");
```

### WASM 加载流程
```javascript
// 1. 动态导入 JS 包装器
const module = await import('./pkg/steganography.js');

// 2. 初始化 WASM 运行时
await module.default();

// 3. 调用导出的函数
module.encode_image(bytes, secret);
```

---

## 🚩 常见问题排查

### ❌ 问题: WASM 模块找不到
**解决:** 运行 `npm run build:wasm`，确保 `src/pkg` 目录存在

### ❌ 问题: 图片无法加载
**解决:** 检查图片格式是否支持，`Cargo.toml` 中 image crate 的 features 是否包含对应格式

### ❌ 问题: 编码/解码失败
**解决:** 打开浏览器控制台查看详细错误信息，`console_error_panic_hook` 会输出 Rust panic 信息

### ❌ 问题: 内存泄漏
**解决:** 确保调用 `URL.revokeObjectURL()` 清理不需要的 Blob URL

---

## ✨ 最佳实践

1. **始终使用 Result 类型** - 避免在 Rust 中使用 panic，让 JS 正确处理错误
2. **缓存 WASM 模块** - 避免重复加载，提高性能
3. **正确清理资源** - Blob URL 需要手动 revoke
4. **使用类型检查** - TypeScript 或 JSDoc 确保类型正确
5. **添加 console_error_panic_hook** - 便于调试 WASM 代码

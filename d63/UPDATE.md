# 🚀 功能更新：密码加密

**更新日期**: 2026-05-15
**功能**: 为图像隐写工具添加 XOR 密码加密

---

## 📋 变更摘要

### 1. Rust 后端变更 (`steganography/src/lib.rs`)

#### 新增 XOR 加密函数
```rust
/// XOR 加密/解密函数（加密和解密使用相同的操作）
fn xor_cipher(data: &[u8], password: &str) -> Vec<u8> {
    let password_bytes = password.as_bytes();
    if password_bytes.is_empty() {
        return data.to_vec();
    }
    
    data.iter()
        .enumerate()
        .map(|(i, &byte)| byte ^ password_bytes[i % password_bytes.len()])
        .collect()
}
```

#### 函数签名变更

**编码函数（添加 password 参数）**:
```rust
// 旧版
pub fn encode_image(carrier: &[u8], secret: &str) -> Result<Vec<u8>, String>

// 新版
pub fn encode_image(carrier: &[u8], secret: &str, password: &str) -> Result<Vec<u8>, String>
```

**解码函数（添加 password 参数）**:
```rust
// 旧版
pub fn decode_image(stego: &[u8]) -> Result<String, String>

// 新版
pub fn decode_image(stego: &[u8], password: &str) -> Result<String, String>
```

#### 编码流程变更
1. 接收秘密文本和密码
2. 使用 XOR 算法加密秘密文本
3. 将加密后的数据嵌入图像

#### 解码流程变更
1. 从图像提取加密数据
2. 使用密码进行 XOR 解密
3. 返回解密后的明文

---

### 2. WASM 加载器变更 (`src/wasmLoader.js`)

#### 编码函数签名更新
```javascript
// 旧版
export async function encodeImage(carrierFile, secret)

// 新版
export async function encodeImage(carrierFile, secret, password = '')
```

#### 解码函数签名更新
```javascript
// 旧版
export async function decodeImage(stegoFile)

// 新版
export async function decodeImage(stegoFile, password = '')
```

**向后兼容**: 密码参数有默认值 `''`，旧代码可以继续工作。

---

### 3. 前端 UI 变更 (`src/App.svelte`)

#### 新增状态变量
```javascript
let encodePassword = '';  // 编码密码
let decodePassword = '';   // 解码密码
```

#### 编码界面新增
- 密码输入框 (type="password")
- 提示文本：说明密码用途

#### 解码界面新增
- 密码输入框 (type="password")
- 提示文本：说明需要使用相同密码
- 错误提示：包含 "(密码错误？)" 提示

#### 新增 CSS 样式
- `.form-group input[type="password"]` - 密码输入框样式
- `.hint-text` - 辅助提示文本样式

---

## 🔐 技术细节

### XOR 加密特性
1. **对称性**: 加密和解密使用相同的算法和密码
2. **简单高效**: 只有位运算，速度极快
3. **可逆性**: `(A XOR B) XOR B = A`
4. **密码循环**: 密码长度不足时自动循环使用

### 安全性说明
⚠️ **注意**: XOR 加密属于简单加密，适合用于：
- 防止直接读取隐藏内容
- 增加隐写的安全层级

不适合用于：
- 高度敏感数据
- 需要高强度加密的场景

对于更高安全性需求，可以：
1. 使用更复杂的加密算法（AES 等）
2. 添加密钥派生函数（KDF）
3. 添加完整性校验（HMAC）

---

## 🧪 测试用例

### 测试 1: 有密码编码 + 正确密码解码
- **步骤**: 选择图片，输入秘密，设置密码 → 编码 → 使用相同密码解码
- **预期**: 成功提取原始秘密文本

### 测试 2: 有密码编码 + 错误密码解码
- **步骤**: 选择图片，输入秘密，设置密码 → 编码 → 使用错误密码解码
- **预期**: 显示乱码或报错（UTF-8 解码失败）

### 测试 3: 无密码编码 + 无密码解码
- **步骤**: 选择图片，输入秘密，不设密码 → 编码 → 不输入密码解码
- **预期**: 成功提取原始秘密文本

### 测试 4: 无密码编码 + 有密码解码
- **步骤**: 选择图片，输入秘密，不设密码 → 编码 → 输入任意密码解码
- **预期**: 显示乱码或报错

---

## 🚀 升级步骤

### 重新编译 WASM
```bash
cd steganography
wasm-pack build --target web --out-dir ../src/pkg
```

### 重启开发服务器
```bash
npm run dev
```

---

## 📝 向后兼容性

✅ **完全向后兼容**
- 密码参数有默认值 `''`
- 不传密码时等同于不加密
- 旧版本生成的图片（无密码）可以用空密码解码

---

## 🔮 未来可能的增强

1. **密码强度指示器** - 显示密码强度等级
2. **密码确认输入** - 编码时要求输入两次密码确认
3. **显示/隐藏密码** - 切换密码输入框的可见性
4. **高级加密算法** - 支持 AES 等更安全的加密方式
5. **盐值生成** - 自动生成随机盐值，增强加密安全性
6. **密码提示** - 隐藏密码提示信息到图片中

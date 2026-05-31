# 质点-弹簧系统软体物理模拟

基于 Rust + WebAssembly 的实时果冻效果物理模拟。

## 技术栈

- **Rust**: 核心物理计算引擎
- **WebAssembly (wasm-bindgen)**: 跨语言桥接
- **HTML5 Canvas**: 前端渲染
- **JavaScript**: 交互控制

## 核心功能

### 1. Verlet 积分
- 位置和速度的联合更新
- 稳定的数值积分方法
- 阻尼系数控制能量损失

### 2. 质点-弹簧系统
- 15x15 网格的质点矩阵
- 结构弹簧（相邻质点）
- 剪切弹簧（对角质点）
- 弯曲弹簧（间隔质点）
- 刚度系数可调

### 3. 自碰撞检测
- 空间网格划分加速
- 相邻网格检测
- 质点间排斥力计算
- 防止穿透和自交

### 4. 鼠标交互
- 拖拽施加外力
- 可调节力的大小和作用半径
- 移动端触摸支持

## 项目结构

```
d84/
├── src/
│   └── lib.rs          # Rust 物理引擎
├── Cargo.toml          # Rust 项目配置
├── index.html          # 前端页面
├── app.js              # 前端逻辑
├── style.css           # 样式文件
└── pkg/                # WASM 编译输出（构建后生成）
```

## 构建和运行

### 前置要求

1. **安装 Rust**:
```bash
# 安装 rustup (Windows)
# 访问 https://rustup.rs/ 下载并安装

# 安装稳定版工具链
rustup default stable
```

2. **安装 wasm-pack**:
```bash
cargo install wasm-pack
```

### 构建 WASM

```bash
wasm-pack build --target web
```

这会在 `pkg/` 目录生成：
- `soft_body_sim_bg.wasm` - WASM 二进制
- `soft_body_sim.js` - JavaScript 桥接文件
- `soft_body_sim.d.ts` - TypeScript 类型定义

### 运行

使用任何静态文件服务器：

```bash
# 使用 Python
python -m http.server 8080

# 或使用 Node.js
npx serve .

# 或使用 Rust 的 miniserve
cargo install miniserve
miniserve . -p 8080
```

然后在浏览器访问 `http://localhost:8080`

## 物理参数说明

| 参数 | 默认值 | 说明 |
|------|--------|------|
| 重力 | 0.5 | 向下的加速度 |
| 阻尼 | 0.99 | 能量损失系数 |
| 弹簧刚度 | 0.5 | 结构弹簧刚度 |
| 对角弹簧刚度 | 0.3 | 剪切弹簧刚度 |
| 质点半径 | 10px | 碰撞检测半径 |
| 物理迭代 | 5次 | 约束求解迭代次数 |

## 操作说明

- **鼠标拖拽**: 按住左键在画布上拖拽，对果冻施加力
- **物理迭代滑块**: 调整约束求解精度（越高越稳定，但性能消耗越大）
- **作用力滑块**: 调整鼠标施加力的大小
- **作用半径滑块**: 调整力的影响范围
- **重置按钮**: 将果冻恢复到初始位置

## 性能优化

1. **空间网格划分**: 将碰撞检测复杂度从 O(n²) 降低到 O(n)
2. **多迭代约束求解**: 多次迭代提高物理稳定性
3. **WASM 优化**: Rust 编译到 WASM 获得接近原生的性能
4. **批量绘制**: Canvas 批量绘制弹簧和质点

## 浏览器兼容性

- Chrome/Edge: ✅ 最佳性能
- Firefox: ✅ 良好支持
- Safari: ✅ 需要较新版本
- 移动端浏览器: ✅ 支持触摸交互

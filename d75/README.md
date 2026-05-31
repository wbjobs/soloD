# 数学公式 DSL 编译器

这是一个用于描述数学公式的领域特定语言（DSL）编译器，使用 Python 实现，支持**自动微分**功能。

## ✨ 核心功能

### 已实现功能
- ✅ 词法分析 - 将源代码转换为 token 流
- ✅ 语法分析 - 生成抽象语法树（AST）
- ✅ **自动微分** - 符号求导引擎，支持高阶导数
- ✅ 代码生成 - C 代码后端（兼容性最好）
- ✅ LLVM IR 代码生成 - 支持直接编译为机器码
- ✅ 内置数学函数 - sin, cos, tan, sqrt, log, exp, abs
- ✅ 变量赋值和命令行输入
- ✅ 用户自定义函数
- ✅ 求导声明和导数函数调用

### 支持的运算
- 基本算术：`+`, `-`, `*`, `/`, `^`（幂运算）
- 括号改变运算优先级
- 一元运算符：`+`, `-`

---

## 🎯 自动微分功能详解

### 语法说明

#### 1. 定义函数
```
func 函数名(参数列表) = 表达式
```

#### 2. 声明求导
```
deriv 函数名 wrt 变量 as 导数函数名
```

### 求导规则实现

| 运算 | 导数 | 示例 |
|------|------|------|
| 常数 | 0 | d/dx (5) = 0 |
| 变量 | 1 (对自身), 0 (其他) | d/da (a) = 1 |
| 加法 | df + dg | d/dx (f+g) = df/dx + dg/dx |
| 减法 | df - dg | d/dx (f-g) = df/dx - dg/dx |
| 乘法 | df*g + f*dg | d/dx (f*g) = df/dx*g + f*dg/dx |
| 除法 | (df*g - f*dg) / g² | d/dx (f/g) = (df/dx*g - f*dg/dx) / g² |
| 幂次 | n * f^(n-1) * df | d/dx (f^n) = n*f^(n-1)*df/dx |
| sin | cos(f) * df | d/dx sin(f) = cos(f)*df/dx |
| cos | -sin(f) * df | d/dx cos(f) = -sin(f)*df/dx |
| tan | sec²(f) * df | d/dx tan(f) = (1+tan²(f))*df/dx |
| sqrt | df / (2*sqrt(f)) | d/dx sqrt(f) = df/dx / (2*sqrt(f)) |
| log | df / f | d/dx log(f) = df/dx / f |
| exp | exp(f) * df | d/dx exp(f) = exp(f)*df/dx |
| abs | f/abs(f) * df | d/dx abs(f) = sign(f)*df/dx |

---

## 📝 使用方法

### 方法一：使用 C 代码生成后端（推荐，兼容性好）

```bash
# 编译DSL程序，生成C代码和可执行文件
python compiler.py example.math output
```

### 方法二：使用 LLVM IR 代码生成后端

需要先安装 llvmlite：
```bash
pip install llvmlite
```

然后使用 LLVM 编译器：
```bash
python llvm_compiler.py example.math output
```

---

## 🚀 自动微分示例

### 示例 1：二次函数求导

```math
input x
input y

func f(a, b) = a^2 + 2 * a * b + b^2
deriv f wrt a as df_da
deriv f wrt b as df_db

val = f(x, y)
dval_dx = df_da(x, y)
dval_dy = df_db(x, y)

print val
print dval_dx
print dval_dy
```

**编译器输出的导数公式：**
- df/da = 2*a + 2*b
- df/db = 2*a + 2*b

---

### 示例 2：二阶导数（位置→速度→加速度）

```math
input t

func position(x) = sin(x) + cos(x)
deriv position wrt x as velocity
deriv velocity wrt x as acceleration

pos = position(t)
vel = velocity(t)
acc = acceleration(t)

print pos
print vel
print acc
```

**编译器输出的导数公式：**
- velocity(x) = cos(x) - sin(x)
- acceleration(x) = -sin(x) - cos(x)

---

### 示例 3：梯度下降

```math
input x
input y
input lr

func f(a, b) = (a - 1)^2 + (b - 2)^2 + 10
deriv f wrt a as df_da
deriv f wrt b as df_db

current_val = f(x, y)
grad_x = df_da(x, y)
grad_y = df_db(x, y)

new_x = x - lr * grad_x
new_y = y - lr * grad_y
new_val = f(new_x, new_y)

print current_val
print grad_x
print grad_y
print new_val
```

**编译器输出的导数公式：**
- df/da = 2 * (a - 1)
- df/db = 2 * (b - 2)

---

## 📁 项目结构

```
├── lexer.py          # 词法分析器
├── ast.py            # 抽象语法树节点定义
├── parser.py         # 语法分析器
├── autodiff.py       # 自动微分引擎（核心）
├── c_codegen.py      # C 代码生成器
├── codegen.py        # LLVM IR 代码生成器
├── compiler.py       # 主编译器程序（C后端）
├── llvm_compiler.py  # LLVM 编译器入口
├── example.math      # 基础示例
├── autodiff_example1.math  # 二次函数求导示例
├── autodiff_trig.math      # 三角函数二阶求导示例
├── gradient_descent.math    # 梯度下降示例
└── requirements.txt  # 依赖项
```

---

## 🔧 编译过程详解

```
DSL 源代码
    ↓
[词法分析] → Token 流
    ↓
[语法分析] → 抽象语法树 (AST)
    ↓
[自动微分] ── 函数定义
  │  └─ 导数公式生成
  └─ 求导声明
    ↓
[代码生成] → C代码 / LLVM IR
    ↓
生成可执行文件
```

### 编译过程输出

编译器会显示完整的编译过程：
1. **词法分析** - 显示所有识别的 token
2. **语法分析** - 解析为 AST
3. **自动微分处理** - 显示求导公式
4. **代码生成** - 生成 C 源代码

---

## 💡 核心算法说明

### 符号微分算法（在 autodiff.py 中）

```python
# 自动微分的核心逻辑
# 对表达式应用微分规则
def differentiate(expr, var_name, param_mapping=None):
    if isinstance(expr, NumberNode):
        return NumberNode(0)  # d/dx (c) = 0
    elif isinstance(expr, VariableNode):
        if expr.name == var_name:
            return NumberNode(1)  # d/dx (x) = 1
        else:
            return NumberNode(0)  # d/dx (y) = 0
    elif isinstance(expr, BinOpNode):
        # 应用四则运算的微分规则
        return differentiate_binary_op(expr, var_name)
    elif isinstance(expr, FunctionCallNode):
        # 应用函数的微分规则（链式法则）
        return differentiate_function(expr, var_name)
```

---

## 📊 技术亮点

1. **纯符号微分**：基于 AST 的数学式求导，不依赖数值计算
2. **链式法则自动应用**：函数调用自动应用链式法则
3. **高阶导数支持**：可以对导数函数再次求导
4. **代码生成优化**：导数表达式自动简化

---

## 🎓 数学验证

### 二次函数验证
```
f(a, b) = a² + 2ab + b²
∂f/∂a = 2a + 2b ✓
∂f/∂b = 2a + 2b ✓
```

### 三角函数验证
```
position(x) = sin(x) + cos(x)
velocity(x) = cos(x) - sin(x) ✓
acceleration(x) = -sin(x) - cos(x) ✓
```

### 梯度下降验证
```
f(a, b) = (a - 1)² + (b - 2)² + 10
∂f/∂a = 2(a - 1) ✓
∂f/∂b = 2(b - 2) ✓
```

---

## ⚠️ 注意事项

1. **C 编译器**：生成可执行文件需要安装 GCC、Clang 或 MSVC
2. **LLVM 后端**：如需使用 LLVM IR 后端，请安装 `llvmlite`
3. **运算优先级**：幂运算 (`^`) > 乘除 (`*`, `/`) > 加减 (`+`, `-`)

---

## 📝 文件类型说明

| 文件后缀 | 说明 |
|---------|------|
| `.math` | DSL 源代码文件 |
| `.c` | 生成的 C 源代码文件 |
| `.o` / `.obj` | 编译生成的目标文件 |
| `.exe` | Windows 可执行文件 |

---

## 🔮 未来扩展方向

1. 支持更丰富的数学运算：矩阵、向量
2. 支持条件语句和循环
3. 添加类型系统（实数、整数、布尔）
4. 支持更多优化选项
5. JIT 即时编译执行

---

## ✨ 总结

本项目成功实现了一个功能完整的数学公式 DSL 编译器，核心亮点是**自动微分引擎**：

- ✅ 支持用户自定义函数
- ✅ 支持函数求导声明
- ✅ 自动生成导数代码
- ✅ 支持高阶导数（二阶导数、三阶导数等）
- ✅ 生成可编译运行的 C 代码

该编译器可用于：
- 数学教学演示
- 科学计算程序快速原型
- 机器学习梯度计算
- 数值算法开发

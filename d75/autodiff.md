# 自动微分功能设计

## 新语法扩展

### 1. 函数定义
```
func f(x, y) = x^2 + sin(x * y)
func g(t) = sqrt(1 + t^2)
```

### 2. 求导声明
```
deriv f wrt x as df_dx
deriv f wrt y as df_dy
deriv g(t) wrt t
```

### 3. 完整示例
```
input x
input y

func f(a, b) = a^2 + 2*a*b + b^2 + sin(a)
deriv f wrt a as df_da
deriv f wrt b as df_db

result = df_da(x, y) + df_db(x, y)
print result
```

## 微分规则实现

### 基本规则
- 常数: d/dx (c) = 0
- 变量: d/dx (x) = 1, d/dx (y) = 0
- 加法: d/dx (f + g) = df/dx + dg/dx
- 减法: d/dx (f - g) = df/dx - dg/dx
- 乘法: d/dx (f * g) = df/dx * g + f * dg/dx
- 除法: d/dx (f / g) = (df/dx * g - f * dg/dx) / g^2
- 幂次: d/dx (f^n) = n * f^(n-1) * df/dx

### 函数导数规则
- sin: d/dx sin(f) = cos(f) * df/dx
- cos: d/dx cos(f) = -sin(f) * df/dx  
- tan: d/dx tan(f) = sec^2(f) * df/dx = (1 + tan^2(f)) * df/dx
- sqrt: d/dx sqrt(f) = df/dx / (2*sqrt(f))
- log: d/dx log(f) = df/dx / f
- exp: d/dx exp(f) = exp(f) * df/dx
- abs: d/dx abs(f) = f/abs(f) * df/dx (f ≠ 0 时)

## 实现步骤

1. AST扩展：添加FunctionDefNode和DerivDeclNode
2. 词法分析：添加func、deriv、wrt、as关键字
3. 语法分析：解析函数定义和求导声明
4. 符号微分引擎：实现differentiate函数
5. 代码生成：支持求导后的函数调用

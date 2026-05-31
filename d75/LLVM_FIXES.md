# LLVM IR 生成修复说明

## 修复的主要问题

### 1. **GEP（GetElementPtr）指令修复**
**问题**：访问 argv 数组时索引类型错误
**修复前**：
```python
idx_const = ir.Constant(ir.IntType(32), idx + 1)
argv_idx = self.builder.gep(self.argv, [idx_const], inbounds=True)
```
**修复后**：
```python
idx_const = ir.Constant(ir.IntType(64), idx + 1)
argv_idx = self.builder.gep(self.argv, [idx_const], inbounds=True)
```
**说明**：LLVM要求指针算术使用64位整数（i64），使用32位会导致类型不匹配和段错误。

### 2. **全局字符串常量修复**
**问题**：格式化字符串创建方式不正确，导致指针无效
**修复前**：直接创建全局变量然后bitcast
**修复后**：
```python
def _create_global_string(self, string):
    string = string + '\0'
    str_type = ir.ArrayType(ir.IntType(8), len(string))
    str_const = ir.Constant(str_type, bytearray(string.encode('utf8')))
    
    global_var = ir.GlobalVariable(self.module, str_type, name=f".str{self.fmt_counter}")
    global_var.initializer = str_const
    global_var.linkage = 'private'
    global_var.global_constant = True
    
    zero = ir.Constant(ir.IntType(32), 0)
    ptr = self.builder.gep(global_var, [zero, zero], inbounds=True)
    return ptr
```
**说明**：使用正确的GEP指令获取字符串首指针，确保内存访问有效。

### 3. **目标三元组（Target Triple）设置**
**问题**：未设置目标三元组，导致生成的代码可能不兼容当前平台
**修复**：
```python
self.module.triple = binding.get_default_triple()
```
**说明**：设置正确的目标三元组确保生成的代码与运行平台兼容。

### 4. **优化级别设置**
**问题**：未启用优化，生成的代码效率低
**修复**：
```python
target_machine = target.create_target_machine(opt=2)
```
**说明**：启用O2优化，提高生成代码的性能。

### 5. **函数声明改进**
**问题**：函数类型定义重复，代码可读性差
**修复**：使用统一的类型变量：
```python
i8 = ir.IntType(8)
i32 = ir.IntType(32)
double = ir.DoubleType()
```

## 调用约定（Calling Convention）说明

### C调用约定（cdecl）
默认情况下，llvmlite使用C调用约定（cdecl），这是正确的，因为：
- `printf`、`sin`、`pow`等都是标准C库函数
- `main`函数也使用C调用约定

### 变参函数（VarArg Functions）
对于`printf`这样的变参函数，我们正确声明了：
```python
printf_ty = ir.FunctionType(i32, [i8.as_pointer()], var_arg=True)
```

## 避免段错误的关键要点

1. **指针类型匹配**：确保所有指针操作使用正确的类型
2. **GEP索引类型**：始终使用i64作为指针算术的索引类型
3. **空指针检查**：虽然我们的DSL不直接处理，但在运行时确保argv有效
4. **内存对齐**：LLVM的alloca指令自动处理对齐
5. **正确的函数签名**：确保函数声明与定义匹配

## 测试验证步骤

### 1. 安装llvmlite
```bash
pip install llvmlite
```

### 2. 运行LLVM编译器
```bash
python llvm_compiler.py simple_test.math test_output
```

### 3. 检查生成的IR
```bash
cat test_output.ll
```

### 4. 编译为可执行文件
```bash
# 使用LLVM工具链
llc -filetype=obj test_output.ll -o test_output.o
gcc test_output.o -o test_output.exe -lm

# 运行测试
test_output.exe 3 4
```

## 预期输出

对于输入 `x=3, y=4`，程序应该输出：
```
11.000000
```

## 生成的LLVM IR结构示例

```llvm
; ModuleID = 'math_dsl'
target triple = "x86_64-pc-windows-msvc"

declare i32 @printf(i8*, ...)
declare double @sin(double)
declare double @pow(double, double)
declare double @atof(i8*)

@.str0 = private constant [4 x i8] c"%f\0A\00"

define i32 @main(i32 %0, i8** %1) {
entry:
  ; 变量分配
  %x = alloca double
  %y = alloca double
  %result = alloca double
  
  ; 参数处理
  %2 = getelementptr inbounds i8*, i8** %1, i64 1
  %3 = load i8*, i8** %2
  %4 = call double @atof(i8* %3)
  store double %4, double* %x
  
  ; 计算和输出
  ...
}
```

## 常见问题排查

### Q1: 编译时出现 "PHI node entries do not match"
**A**: 确保基本块结构正确，所有分支都有统一的PHI节点输入。

### Q2: 运行时出现段错误
**A**: 检查：
1. GEP指令的索引类型（必须是i64）
2. 全局变量是否正确初始化
3. 函数调用参数类型是否匹配

### Q3: 链接时找不到数学函数
**A**: 确保链接时添加 `-lm` 标志。

### Q4: Windows上编译问题
**A**: 确保使用正确的目标三元组，并且使用兼容的链接器。

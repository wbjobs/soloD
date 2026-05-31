from llvmlite import ir, binding

class CodeGenerator:
    def __init__(self):
        self.module = ir.Module(name="math_dsl")
        self.module.triple = binding.get_default_triple()
        self.builder = None
        self.symbols = {}
        self.input_vars = []
        self.fmt_counter = 0
        self._init_builtins()
    
    def _init_builtins(self):
        double = ir.DoubleType()
        i8 = ir.IntType(8)
        i32 = ir.IntType(32)
        
        printf_ty = ir.FunctionType(i32, [i8.as_pointer()], var_arg=True)
        self.printf = ir.Function(self.module, printf_ty, name="printf")
        
        math_ty = ir.FunctionType(double, [double])
        self.sin = ir.Function(self.module, math_ty, name="sin")
        self.cos = ir.Function(self.module, math_ty, name="cos")
        self.tan = ir.Function(self.module, math_ty, name="tan")
        self.sqrt = ir.Function(self.module, math_ty, name="sqrt")
        self.log = ir.Function(self.module, math_ty, name="log")
        self.exp = ir.Function(self.module, math_ty, name="exp")
        self.fabs = ir.Function(self.module, math_ty, name="fabs")
        
        pow_ty = ir.FunctionType(double, [double, double])
        self.pow = ir.Function(self.module, pow_ty, name="pow")
        
        atof_ty = ir.FunctionType(double, [i8.as_pointer()])
        self.atof = ir.Function(self.module, atof_ty, name="atof")
    
    def _create_global_string(self, string):
        string = string + '\0'
        str_type = ir.ArrayType(ir.IntType(8), len(string))
        str_const = ir.Constant(str_type, bytearray(string.encode('utf8')))
        
        global_var = ir.GlobalVariable(
            self.module, 
            str_type, 
            name=f".str{self.fmt_counter}"
        )
        self.fmt_counter += 1
        global_var.initializer = str_const
        global_var.linkage = 'private'
        global_var.global_constant = True
        
        zero = ir.Constant(ir.IntType(32), 0)
        ptr = self.builder.gep(global_var, [zero, zero], inbounds=True)
        return ptr
    
    def generate(self, ast_nodes):
        double = ir.DoubleType()
        i32 = ir.IntType(32)
        i8 = ir.IntType(8)
        
        main_ty = ir.FunctionType(i32, [i32, i8.as_pointer().as_pointer()])
        main_func = ir.Function(self.module, main_ty, name="main")
        
        entry = main_func.append_basic_block(name="entry")
        self.builder = ir.IRBuilder(entry)
        
        self.argc = main_func.args[0]
        self.argv = main_func.args[1]
        
        for node in ast_nodes:
            self._visit(node)
        
        self.builder.ret(ir.Constant(i32, 0))
        
        return self.module
    
    def _visit(self, node):
        from ast import NumberNode, VariableNode, BinOpNode, UnaryOpNode
        from ast import FunctionCallNode, AssignNode, PrintNode, InputNode
        
        if isinstance(node, NumberNode):
            return self._visit_number(node)
        elif isinstance(node, VariableNode):
            return self._visit_variable(node)
        elif isinstance(node, BinOpNode):
            return self._visit_binop(node)
        elif isinstance(node, UnaryOpNode):
            return self._visit_unaryop(node)
        elif isinstance(node, FunctionCallNode):
            return self._visit_function_call(node)
        elif isinstance(node, AssignNode):
            return self._visit_assign(node)
        elif isinstance(node, PrintNode):
            return self._visit_print(node)
        elif isinstance(node, InputNode):
            return self._visit_input(node)
        else:
            raise Exception(f"Unknown node type: {type(node)}")
    
    def _visit_number(self, node):
        return ir.Constant(ir.DoubleType(), float(node.value))
    
    def _visit_variable(self, node):
        if node.name not in self.symbols:
            raise Exception(f"Undefined variable: {node.name}")
        return self.builder.load(self.symbols[node.name], name=node.name)
    
    def _visit_binop(self, node):
        left = self._visit(node.left)
        right = self._visit(node.right)
        
        if node.op == 'PLUS':
            return self.builder.fadd(left, right, name='addtmp')
        elif node.op == 'MINUS':
            return self.builder.fsub(left, right, name='subtmp')
        elif node.op == 'MUL':
            return self.builder.fmul(left, right, name='multmp')
        elif node.op == 'DIV':
            return self.builder.fdiv(left, right, name='divtmp')
        elif node.op == 'POW':
            return self.builder.call(self.pow, [left, right], name='powtmp')
        else:
            raise Exception(f"Unknown binary operator: {node.op}")
    
    def _visit_unaryop(self, node):
        operand = self._visit(node.operand)
        
        if node.op == 'PLUS':
            return operand
        elif node.op == 'MINUS':
            zero = ir.Constant(ir.DoubleType(), 0.0)
            return self.builder.fsub(zero, operand, name='negtmp')
        else:
            raise Exception(f"Unknown unary operator: {node.op}")
    
    def _visit_function_call(self, node):
        arg = self._visit(node.arg)
        func_map = {
            'sin': self.sin,
            'cos': self.cos,
            'tan': self.tan,
            'sqrt': self.sqrt,
            'log': self.log,
            'exp': self.exp,
            'abs': self.fabs
        }
        
        if node.name not in func_map:
            raise Exception(f"Unknown function: {node.name}")
        
        return self.builder.call(func_map[node.name], [arg], name=f'{node.name}tmp')
    
    def _visit_assign(self, node):
        value = self._visit(node.value)
        if node.name not in self.symbols:
            var_addr = self.builder.alloca(ir.DoubleType(), name=node.name)
            self.symbols[node.name] = var_addr
        self.builder.store(value, self.symbols[node.name])
        return value
    
    def _visit_print(self, node):
        value = self._visit(node.expr)
        fmt_ptr = self._create_global_string("%f\n")
        self.builder.call(self.printf, [fmt_ptr, value])
        return value
    
    def _visit_input(self, node):
        idx = len(self.input_vars)
        self.input_vars.append(node.name)
        
        idx_const = ir.Constant(ir.IntType(64), idx + 1)
        argv_idx = self.builder.gep(self.argv, [idx_const], inbounds=True)
        arg_str = self.builder.load(argv_idx)
        
        value = self.builder.call(self.atof, [arg_str])
        
        var_addr = self.builder.alloca(ir.DoubleType(), name=node.name)
        self.symbols[node.name] = var_addr
        self.builder.store(value, var_addr)
        return value

def compile_ir(llvm_ir):
    binding.initialize()
    binding.initialize_native_target()
    binding.initialize_native_asmprinter()
    
    target = binding.Target.from_default_triple()
    target_machine = target.create_target_machine(opt=2)
    
    mod = binding.parse_assembly(str(llvm_ir))
    mod.verify()
    
    return mod, target_machine

def generate_executable(mod, target_machine, output_file):
    import subprocess
    import os
    
    obj_file = output_file + '.o'
    with open(obj_file, 'wb') as f:
        f.write(target_machine.emit_object(mod))
    
    exe_file = output_file + '.exe' if os.name == 'nt' else output_file
    
    compilers = [
        (['gcc', obj_file, '-o', exe_file, '-lm'], "GCC"),
        (['clang', obj_file, '-o', exe_file, '-lm'], "Clang"),
    ]
    
    for compiler_cmd, name in compilers:
        try:
            subprocess.run(compiler_cmd, check=True, 
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            print(f"Success! Executable generated using {name}: {exe_file}")
            print(f"Object file: {obj_file}")
            return True
        except (subprocess.CalledProcessError, FileNotFoundError):
            continue
    
    print(f"\nNo C compiler found for linking (tried GCC, Clang).")
    print(f"Object file saved to: {obj_file}")
    print(f"LLVM IR saved to: {output_file}.ll")
    print("\nTo link manually:")
    print(f"  gcc {obj_file} -o {exe_file} -lm")
    return False

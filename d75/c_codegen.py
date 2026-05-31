import subprocess
import os
from autodiff import AutoDifferentiator, simplify_ast, ast_to_string

class CCodeGenerator:
    def __init__(self):
        self.code = []
        self.symbols = set()
        self.input_vars = []
        self.differentiator = AutoDifferentiator()
        self.deriv_funcs = set()
    
    def generate(self, ast_nodes):
        from ast import FunctionDefNode, DerivDeclNode
        
        func_defs = []
        deriv_decls = []
        main_stmts = []
        
        for node in ast_nodes:
            if isinstance(node, FunctionDefNode):
                func_defs.append(node)
                self.differentiator.register_function(node)
            elif isinstance(node, DerivDeclNode):
                deriv_decls.append(node)
            else:
                main_stmts.append(node)
        
        for decl in deriv_decls:
            deriv_func = self.differentiator.differentiate_function(
                decl.func_name, decl.wrt_var, decl.deriv_name
            )
            func_defs.append(deriv_func)
            self.deriv_funcs.add(deriv_func.name)
        
        self._emit("#include <stdio.h>")
        self._emit("#include <stdlib.h>")
        self._emit("#include <math.h>")
        self._emit("")
        
        for func_def in func_defs:
            self._generate_function(func_def)
            self._emit("")
        
        self._emit("int main(int argc, char *argv[]) {")
        
        for node in main_stmts:
            self._visit(node)
        
        self._emit("    return 0;")
        self._emit("}")
        
        return "\n".join(self.code)
    
    def _emit(self, line):
        self.code.append(line)
    
    def _generate_function(self, func_def):
        params_str = ", ".join(f"double {p}" for p in func_def.params)
        self._emit(f"double {func_def.name}({params_str}) {{")
        
        body_simplified = simplify_ast(func_def.body)
        body_str = self._visit_expr(body_simplified)
        self._emit(f"    return {body_str};")
        self._emit("}")
    
    def _visit(self, node):
        from ast import NumberNode, VariableNode, BinOpNode, UnaryOpNode
        from ast import FunctionCallNode, AssignNode, PrintNode, InputNode
        from ast import UserFunctionCallNode, FunctionDefNode, DerivDeclNode
        
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
        elif isinstance(node, UserFunctionCallNode):
            return self._visit_user_function_call(node)
        elif isinstance(node, AssignNode):
            return self._visit_assign(node)
        elif isinstance(node, PrintNode):
            return self._visit_print(node)
        elif isinstance(node, InputNode):
            return self._visit_input(node)
        elif isinstance(node, (FunctionDefNode, DerivDeclNode)):
            return None
        else:
            raise Exception(f"Unknown node type: {type(node)}")
    
    def _visit_expr(self, node):
        from ast import NumberNode, VariableNode, BinOpNode, UnaryOpNode
        from ast import FunctionCallNode, UserFunctionCallNode
        
        if isinstance(node, NumberNode):
            return self._visit_number(node)
        elif isinstance(node, VariableNode):
            return node.name
        elif isinstance(node, BinOpNode):
            left = self._visit_expr(node.left)
            right = self._visit_expr(node.right)
            
            op_map = {
                'PLUS': '+',
                'MINUS': '-',
                'MUL': '*',
                'DIV': '/',
                'POW': None
            }
            
            if node.op == 'POW':
                return f"pow({left}, {right})"
            else:
                return f"({left} {op_map[node.op]} {right})"
        
        elif isinstance(node, UnaryOpNode):
            operand = self._visit_expr(node.operand)
            
            if node.op == 'PLUS':
                return operand
            elif node.op == 'MINUS':
                return f"(-{operand})"
            else:
                raise Exception(f"Unknown unary operator: {node.op}")
        
        elif isinstance(node, FunctionCallNode):
            arg = self._visit_expr(node.arg)
            func_map = {
                'sin': 'sin',
                'cos': 'cos',
                'tan': 'tan',
                'sqrt': 'sqrt',
                'log': 'log',
                'exp': 'exp',
                'abs': 'fabs'
            }
            
            if node.name not in func_map:
                raise Exception(f"Unknown function: {node.name}")
            
            return f"{func_map[node.name]}({arg})"
        
        elif isinstance(node, UserFunctionCallNode):
            args_str = ", ".join(self._visit_expr(arg) for arg in node.args)
            return f"{node.name}({args_str})"
        
        raise Exception(f"Unknown node type in expression: {type(node)}")
    
    def _visit_number(self, node):
        return str(node.value)
    
    def _visit_variable(self, node):
        if node.name not in self.symbols:
            raise Exception(f"Undefined variable: {node.name}")
        return node.name
    
    def _visit_binop(self, node):
        left = self._visit(node.left)
        right = self._visit(node.right)
        
        op_map = {
            'PLUS': '+',
            'MINUS': '-',
            'MUL': '*',
            'DIV': '/',
            'POW': None
        }
        
        if node.op == 'POW':
            return f"pow({left}, {right})"
        else:
            return f"({left} {op_map[node.op]} {right})"
    
    def _visit_unaryop(self, node):
        operand = self._visit(node.operand)
        
        if node.op == 'PLUS':
            return operand
        elif node.op == 'MINUS':
            return f"(-{operand})"
        else:
            raise Exception(f"Unknown unary operator: {node.op}")
    
    def _visit_function_call(self, node):
        arg = self._visit(node.arg)
        func_map = {
            'sin': 'sin',
            'cos': 'cos',
            'tan': 'tan',
            'sqrt': 'sqrt',
            'log': 'log',
            'exp': 'exp',
            'abs': 'fabs'
        }
        
        if node.name not in func_map:
            raise Exception(f"Unknown function: {node.name}")
        
        return f"{func_map[node.name]}({arg})"
    
    def _visit_user_function_call(self, node):
        args_str = ", ".join(self._visit(arg) for arg in node.args)
        return f"{node.name}({args_str})"
    
    def _visit_assign(self, node):
        value = self._visit(node.value)
        if node.name not in self.symbols:
            self._emit(f"    double {node.name} = {value};")
            self.symbols.add(node.name)
        else:
            self._emit(f"    {node.name} = {value};")
        return value
    
    def _visit_print(self, node):
        value = self._visit(node.expr)
        self._emit(f'    printf("%f\\n", {value});')
        return value
    
    def _visit_input(self, node):
        idx = len(self.input_vars)
        self.input_vars.append(node.name)
        
        self._emit(f"    double {node.name} = atof(argv[{idx + 1}]);")
        self.symbols.add(node.name)
        return node.name

def generate_executable_from_c(c_code, output_file):
    c_file = output_file + '.c'
    with open(c_file, 'w') as f:
        f.write(c_code)
    
    exe_file = output_file + '.exe' if os.name == 'nt' else output_file
    
    compilers = [
        (['gcc', c_file, '-o', exe_file, '-lm'], "GCC"),
        (['clang', c_file, '-o', exe_file, '-lm'], "Clang"),
        (['cl', c_file, '/Fe:' + exe_file], "MSVC"),
    ]
    
    for compiler_cmd, name in compilers:
        try:
            subprocess.run(compiler_cmd, check=True, 
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            print(f"Success! Executable generated using {name}: {exe_file}")
            print(f"C source saved to: {c_file}")
            return True
        except (subprocess.CalledProcessError, FileNotFoundError):
            continue
    
    print(f"\nNo C compiler found (tried GCC, Clang, MSVC).")
    print(f"C source code saved to: {c_file}")
    print("\nTo compile manually:")
    print(f"  gcc {c_file} -o {exe_file} -lm")
    print(f"  clang {c_file} -o {exe_file} -lm")
    print("\nOr if you have Visual Studio:")
    print(f"  cl {c_file} /Fe:{exe_file}")
    return False

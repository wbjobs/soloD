from ast import *

class AutoDifferentiator:
    def __init__(self):
        self.functions = {}
    
    def register_function(self, func_def):
        self.functions[func_def.name] = func_def
    
    def differentiate(self, expr, var_name, param_mapping=None):
        if param_mapping is None:
            param_mapping = {}
        
        if isinstance(expr, NumberNode):
            return NumberNode(0)
        
        elif isinstance(expr, VariableNode):
            actual_name = param_mapping.get(expr.name, expr.name)
            if actual_name == var_name:
                return NumberNode(1)
            else:
                return NumberNode(0)
        
        elif isinstance(expr, UnaryOpNode):
            operand_deriv = self.differentiate(expr.operand, var_name, param_mapping)
            
            if expr.op == 'PLUS':
                return operand_deriv
            elif expr.op == 'MINUS':
                return UnaryOpNode('MINUS', operand_deriv)
        
        elif isinstance(expr, BinOpNode):
            left_deriv = self.differentiate(expr.left, var_name, param_mapping)
            right_deriv = self.differentiate(expr.right, var_name, param_mapping)
            
            if expr.op == 'PLUS':
                return BinOpNode('PLUS', left_deriv, right_deriv)
            
            elif expr.op == 'MINUS':
                return BinOpNode('MINUS', left_deriv, right_deriv)
            
            elif expr.op == 'MUL':
                term1 = BinOpNode('MUL', left_deriv, expr.right)
                term2 = BinOpNode('MUL', expr.left, right_deriv)
                return BinOpNode('PLUS', term1, term2)
            
            elif expr.op == 'DIV':
                numerator1 = BinOpNode('MUL', left_deriv, expr.right)
                numerator2 = BinOpNode('MUL', expr.left, right_deriv)
                numerator = BinOpNode('MINUS', numerator1, numerator2)
                denominator = BinOpNode('POW', expr.right, NumberNode(2))
                return BinOpNode('DIV', numerator, denominator)
            
            elif expr.op == 'POW':
                base_deriv = left_deriv
                base = expr.left
                power = expr.right
                
                term1 = BinOpNode('MUL', power, 
                                  BinOpNode('POW', base, BinOpNode('MINUS', power, NumberNode(1))))
                return BinOpNode('MUL', term1, base_deriv)
        
        elif isinstance(expr, FunctionCallNode):
            arg_deriv = self.differentiate(expr.arg, var_name, param_mapping)
            
            func_name = expr.name
            arg = expr.arg
            
            if func_name == 'sin':
                cos_term = FunctionCallNode('cos', arg)
                return BinOpNode('MUL', cos_term, arg_deriv)
            
            elif func_name == 'cos':
                sin_term = FunctionCallNode('sin', arg)
                neg_sin = UnaryOpNode('MINUS', sin_term)
                return BinOpNode('MUL', neg_sin, arg_deriv)
            
            elif func_name == 'tan':
                tan_term = FunctionCallNode('tan', arg)
                tan_squared = BinOpNode('POW', tan_term, NumberNode(2))
                sec_squared = BinOpNode('PLUS', NumberNode(1), tan_squared)
                return BinOpNode('MUL', sec_squared, arg_deriv)
            
            elif func_name == 'sqrt':
                two_sqrt = BinOpNode('MUL', NumberNode(2), FunctionCallNode('sqrt', arg))
                return BinOpNode('DIV', arg_deriv, two_sqrt)
            
            elif func_name == 'log':
                return BinOpNode('DIV', arg_deriv, arg)
            
            elif func_name == 'exp':
                exp_term = FunctionCallNode('exp', arg)
                return BinOpNode('MUL', exp_term, arg_deriv)
            
            elif func_name == 'abs':
                abs_term = FunctionCallNode('abs', arg)
                ratio = BinOpNode('DIV', arg, abs_term)
                return BinOpNode('MUL', ratio, arg_deriv)
        
        elif isinstance(expr, UserFunctionCallNode):
            if expr.name not in self.functions:
                raise Exception(f"Undefined function: {expr.name}")
            
            func_def = self.functions[expr.name]
            
            if len(expr.args) != len(func_def.params):
                raise Exception(f"Argument count mismatch for {expr.name}")
            
            param_mapping_new = {}
            for i, param in enumerate(func_def.params):
                param_mapping_new[param] = expr.args[i]
            
            deriv_body = self.differentiate(func_def.body, var_name, param_mapping_new)
            return deriv_body
        
        raise Exception(f"Cannot differentiate node type: {type(expr)}")
    
    def differentiate_function(self, func_name, wrt_param, deriv_name=None):
        if func_name not in self.functions:
            raise Exception(f"Undefined function: {func_name}")
        
        func_def = self.functions[func_name]
        
        if wrt_param not in func_def.params:
            raise Exception(f"Parameter {wrt_param} not found in function {func_name}")
        
        deriv_body = self.differentiate(func_def.body, wrt_param)
        
        if deriv_name is None:
            deriv_name = f"d{func_name}_d{wrt_param}"
        
        deriv_func = FunctionDefNode(deriv_name, func_def.params, deriv_body)
        self.functions[deriv_name] = deriv_func
        return deriv_func


def simplify_ast(node):
    if isinstance(node, NumberNode):
        return node
    
    elif isinstance(node, VariableNode):
        return node
    
    elif isinstance(node, UnaryOpNode):
        operand = simplify_ast(node.operand)
        
        if node.op == 'PLUS':
            return operand
        
        elif node.op == 'MINUS':
            if isinstance(operand, UnaryOpNode) and operand.op == 'MINUS':
                return simplify_ast(operand.operand)
            if isinstance(operand, NumberNode):
                return NumberNode(-operand.value)
            return UnaryOpNode('MINUS', operand)
    
    elif isinstance(node, BinOpNode):
        left = simplify_ast(node.left)
        right = simplify_ast(node.right)
        
        if isinstance(left, NumberNode) and isinstance(right, NumberNode):
            l_val = left.value
            r_val = right.value
            
            if node.op == 'PLUS':
                return NumberNode(l_val + r_val)
            elif node.op == 'MINUS':
                return NumberNode(l_val - r_val)
            elif node.op == 'MUL':
                return NumberNode(l_val * r_val)
            elif node.op == 'DIV' and r_val != 0:
                return NumberNode(l_val / r_val)
            elif node.op == 'POW':
                return NumberNode(l_val ** r_val)
        
        if node.op == 'PLUS':
            if isinstance(left, NumberNode) and left.value == 0:
                return right
            if isinstance(right, NumberNode) and right.value == 0:
                return left
        
        elif node.op == 'MINUS':
            if isinstance(right, NumberNode) and right.value == 0:
                return left
        
        elif node.op == 'MUL':
            if isinstance(left, NumberNode) and left.value == 0:
                return NumberNode(0)
            if isinstance(right, NumberNode) and right.value == 0:
                return NumberNode(0)
            if isinstance(left, NumberNode) and left.value == 1:
                return right
            if isinstance(right, NumberNode) and right.value == 1:
                return left
        
        elif node.op == 'DIV':
            if isinstance(left, NumberNode) and left.value == 0:
                return NumberNode(0)
            if isinstance(right, NumberNode) and right.value == 1:
                return left
        
        elif node.op == 'POW':
            if isinstance(right, NumberNode) and right.value == 0:
                return NumberNode(1)
            if isinstance(right, NumberNode) and right.value == 1:
                return left
        
        return BinOpNode(node.op, left, right)
    
    elif isinstance(node, FunctionCallNode):
        return FunctionCallNode(node.name, simplify_ast(node.arg))
    
    elif isinstance(node, UserFunctionCallNode):
        return UserFunctionCallNode(node.name, [simplify_ast(arg) for arg in node.args])
    
    return node


def ast_to_string(node, precedence=0):
    if isinstance(node, NumberNode):
        return str(node.value)
    
    elif isinstance(node, VariableNode):
        return node.name
    
    elif isinstance(node, UnaryOpNode):
        op_map = {'PLUS': '+', 'MINUS': '-'}
        inner = ast_to_string(node.operand, 10)
        return f"{op_map[node.op]}{inner}"
    
    elif isinstance(node, BinOpNode):
        op_map = {
            'PLUS': ('+', 1),
            'MINUS': ('-', 1),
            'MUL': ('*', 2),
            'DIV': ('/', 2),
            'POW': ('^', 3)
        }
        op, prec = op_map[node.op]
        left_str = ast_to_string(node.left, prec)
        right_str = ast_to_string(node.right, prec)
        
        result = f"{left_str} {op} {right_str}"
        if precedence > prec:
            result = f"({result})"
        return result
    
    elif isinstance(node, FunctionCallNode):
        arg_str = ast_to_string(node.arg)
        return f"{node.name}({arg_str})"
    
    elif isinstance(node, UserFunctionCallNode):
        args_str = ", ".join(ast_to_string(arg) for arg in node.args)
        return f"{node.name}({args_str})"
    
    return "???"

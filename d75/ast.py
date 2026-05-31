class ASTNode:
    pass

class NumberNode(ASTNode):
    def __init__(self, value):
        self.value = value

class VariableNode(ASTNode):
    def __init__(self, name):
        self.name = name

class BinOpNode(ASTNode):
    def __init__(self, op, left, right):
        self.op = op
        self.left = left
        self.right = right

class UnaryOpNode(ASTNode):
    def __init__(self, op, operand):
        self.op = op
        self.operand = operand

class FunctionCallNode(ASTNode):
    def __init__(self, name, arg):
        self.name = name
        self.arg = arg

class UserFunctionCallNode(ASTNode):
    def __init__(self, name, args):
        self.name = name
        self.args = args

class AssignNode(ASTNode):
    def __init__(self, name, value):
        self.name = name
        self.value = value

class PrintNode(ASTNode):
    def __init__(self, expr):
        self.expr = expr

class InputNode(ASTNode):
    def __init__(self, name):
        self.name = name

class FunctionDefNode(ASTNode):
    def __init__(self, name, params, body):
        self.name = name
        self.params = params
        self.body = body

class DerivDeclNode(ASTNode):
    def __init__(self, func_name, wrt_var, deriv_name=None):
        self.func_name = func_name
        self.wrt_var = wrt_var
        self.deriv_name = deriv_name

from ast import *

class Parser:
    def __init__(self, tokens):
        self.tokens = tokens
        self.pos = 0
        self.current_token = self.tokens[self.pos]
    
    def error(self):
        raise Exception('Invalid syntax')
    
    def eat(self, token_type):
        if self.current_token.type == token_type:
            self.pos += 1
            self.current_token = self.tokens[self.pos]
        else:
            self.error()
    
    def skip_newlines(self):
        while self.current_token.type == 'NEWLINE':
            self.eat('NEWLINE')
    
    def program(self):
        statements = []
        self.skip_newlines()
        while self.current_token.type != 'EOF':
            stmt = self.statement()
            statements.append(stmt)
            self.skip_newlines()
        return statements
    
    def statement(self):
        token = self.current_token
        
        if token.type == 'PRINT':
            self.eat('PRINT')
            expr = self.expr()
            return PrintNode(expr)
        
        elif token.type == 'INPUT':
            self.eat('INPUT')
            var_name = self.current_token.value
            self.eat('ID')
            return InputNode(var_name)
        
        elif token.type == 'FUNC_KW':
            self.eat('FUNC_KW')
            func_name = self.current_token.value
            self.eat('ID')
            self.eat('LPAREN')
            params = []
            if self.current_token.type == 'ID':
                params.append(self.current_token.value)
                self.eat('ID')
                while self.current_token.type == 'COMMA':
                    self.eat('COMMA')
                    params.append(self.current_token.value)
                    self.eat('ID')
            self.eat('RPAREN')
            self.eat('ASSIGN')
            body = self.expr()
            return FunctionDefNode(func_name, params, body)
        
        elif token.type == 'DERIV':
            self.eat('DERIV')
            func_name = self.current_token.value
            self.eat('ID')
            self.eat('WRT')
            wrt_var = self.current_token.value
            self.eat('ID')
            deriv_name = None
            if self.current_token.type == 'AS_KW':
                self.eat('AS_KW')
                deriv_name = self.current_token.value
                self.eat('ID')
            return DerivDeclNode(func_name, wrt_var, deriv_name)
        
        elif token.type == 'ID':
            var_name = token.value
            self.eat('ID')
            
            if self.current_token.type == 'ASSIGN':
                self.eat('ASSIGN')
                expr = self.expr()
                return AssignNode(var_name, expr)
            
            elif self.current_token.type == 'LPAREN':
                self.eat('LPAREN')
                args = []
                if self.current_token.type != 'RPAREN':
                    args.append(self.expr())
                    while self.current_token.type == 'COMMA':
                        self.eat('COMMA')
                        args.append(self.expr())
                self.eat('RPAREN')
                return UserFunctionCallNode(var_name, args)
            
            else:
                return VariableNode(var_name)
        
        else:
            return self.expr()
    
    def expr(self):
        node = self.term()
        
        while self.current_token.type in ('PLUS', 'MINUS'):
            token = self.current_token
            if token.type == 'PLUS':
                self.eat('PLUS')
            elif token.type == 'MINUS':
                self.eat('MINUS')
            
            node = BinOpNode(op=token.type, left=node, right=self.term())
        
        return node
    
    def term(self):
        node = self.factor()
        
        while self.current_token.type in ('MUL', 'DIV'):
            token = self.current_token
            if token.type == 'MUL':
                self.eat('MUL')
            elif token.type == 'DIV':
                self.eat('DIV')
            
            node = BinOpNode(op=token.type, left=node, right=self.factor())
        
        return node
    
    def factor(self):
        node = self.power()
        
        while self.current_token.type == 'POW':
            self.eat('POW')
            node = BinOpNode(op='POW', left=node, right=self.factor())
        
        return node
    
    def power(self):
        token = self.current_token
        
        if token.type == 'PLUS':
            self.eat('PLUS')
            return UnaryOpNode('PLUS', operand=self.power())
        
        elif token.type == 'MINUS':
            self.eat('MINUS')
            return UnaryOpNode('MINUS', operand=self.power())
        
        elif token.type == 'NUMBER':
            self.eat('NUMBER')
            return NumberNode(token.value)
        
        elif token.type == 'FUNC':
            func_name = token.value
            self.eat('FUNC')
            self.eat('LPAREN')
            arg = self.expr()
            self.eat('RPAREN')
            return FunctionCallNode(func_name, arg)
        
        elif token.type == 'ID':
            var_name = token.value
            self.eat('ID')
            
            if self.current_token.type == 'LPAREN':
                self.eat('LPAREN')
                args = []
                if self.current_token.type != 'RPAREN':
                    args.append(self.expr())
                    while self.current_token.type == 'COMMA':
                        self.eat('COMMA')
                        args.append(self.expr())
                self.eat('RPAREN')
                return UserFunctionCallNode(var_name, args)
            
            return VariableNode(var_name)
        
        elif token.type == 'LPAREN':
            self.eat('LPAREN')
            node = self.expr()
            self.eat('RPAREN')
            return node
        
        self.error()
    
    def parse(self):
        return self.program()

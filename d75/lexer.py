import re

class Token:
    def __init__(self, type_, value=None):
        self.type = type_
        self.value = value
    
    def __repr__(self):
        if self.value:
            return f"Token({self.type}, {self.value})"
        return f"Token({self.type})"

class Lexer:
    def __init__(self, source):
        self.source = source
        self.pos = 0
        self.tokens = []
        
        self.token_specs = [
            ('PRINT', r'print'),
            ('INPUT', r'input'),
            ('FUNC', r'sin|cos|tan|sqrt|log|exp|abs'),
            ('FUNC_KW', r'func'),
            ('DERIV', r'deriv'),
            ('WRT', r'wrt'),
            ('AS_KW', r'as'),
            ('NUMBER', r'\d+\.?\d*'),
            ('ID', r'[a-zA-Z_][a-zA-Z0-9_]*'),
            ('ASSIGN', r'='),
            ('PLUS', r'\+'),
            ('MINUS', r'-'),
            ('MUL', r'\*'),
            ('DIV', r'/'),
            ('POW', r'\^'),
            ('LPAREN', r'\('),
            ('RPAREN', r'\)'),
            ('COMMA', r','),
            ('NEWLINE', r'\n'),
            ('SKIP', r'[ \t]+'),
            ('MISMATCH', r'.'),
        ]
        
        self.token_regex = '|'.join(f'(?P<{name}>{regex})' for name, regex in self.token_specs)
    
    def tokenize(self):
        for mo in re.finditer(self.token_regex, self.source):
            kind = mo.lastgroup
            value = mo.group()
            
            if kind == 'NUMBER':
                value = float(value) if '.' in value else int(value)
                self.tokens.append(Token(kind, value))
            elif kind == 'ID' or kind == 'FUNC':
                self.tokens.append(Token(kind, value))
            elif kind == 'NEWLINE':
                self.tokens.append(Token(kind))
            elif kind == 'SKIP':
                continue
            elif kind == 'MISMATCH':
                raise RuntimeError(f'Unexpected character: {value}')
            else:
                self.tokens.append(Token(kind))
        
        self.tokens.append(Token('EOF'))
        return self.tokens

#!/usr/bin/env python3
from lexer import Lexer
from parser import Parser

source = """
input x
input y

a = x + y * 2
b = (x - y) ^ 2
print a + b
"""

print("Testing Lexer and Parser...")
print("\nSource code:")
print(source)

lexer = Lexer(source)
tokens = lexer.tokenize()

print("\nTokens:")
for token in tokens:
    print(token)

parser = Parser(tokens)
ast = parser.parse()

print(f"\nParsing successful! {len(ast)} statements in AST.")
print("Test passed!")

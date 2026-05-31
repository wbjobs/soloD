#!/usr/bin/env python3
import sys
from lexer import Lexer
from parser import Parser
from c_codegen import CCodeGenerator, generate_executable_from_c
from ast import FunctionDefNode, DerivDeclNode
from autodiff import simplify_ast, ast_to_string

def process_ast_with_autodiff(ast):
    from autodiff import AutoDifferentiator
    
    differentiator = AutoDifferentiator()
    func_defs = []
    deriv_decls = []
    main_stmts = []
    
    for node in ast:
        if isinstance(node, FunctionDefNode):
            func_defs.append(node)
            differentiator.register_function(node)
        elif isinstance(node, DerivDeclNode):
            deriv_decls.append(node)
        else:
            main_stmts.append(node)
    
    print("\n" + "=" * 60)
    print("Phase 2a: Automatic Differentiation")
    print("=" * 60)
    
    for func in func_defs:
        print(f"\n  Defined function: {func.name}({', '.join(func.params)})")
        print(f"    Body: {ast_to_string(func.body)}")
    
    for decl in deriv_decls:
        deriv_func = differentiator.differentiate_function(
            decl.func_name, decl.wrt_var, decl.deriv_name
        )
        func_defs.append(deriv_func)
        
        simplified = simplify_ast(deriv_func.body)
        print(f"\n  Derivative: d{decl.func_name}/d{decl.wrt_var}")
        print(f"    Name: {deriv_func.name}")
        print(f"    Formula: {ast_to_string(simplified)}")
    
    return func_defs + main_stmts

def main():
    if len(sys.argv) < 2:
        print("Usage: python compiler.py <input_file> [output_file]")
        print("Example: python compiler.py example.math output")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else 'output'
    
    try:
        with open(input_file, 'r') as f:
            source = f.read()
    except FileNotFoundError:
        print(f"Error: File '{input_file}' not found")
        sys.exit(1)
    
    print("=" * 60)
    print("Phase 1: Lexical Analysis (Tokenization)")
    print("=" * 60)
    lexer = Lexer(source)
    tokens = lexer.tokenize()
    for token in tokens[:-1]:
        print(f"  {token}")
    
    print("\n" + "=" * 60)
    print("Phase 2: Syntax Analysis (Parsing)")
    print("=" * 60)
    parser = Parser(tokens)
    ast = parser.parse()
    print(f"  ✓ AST generated successfully")
    print(f"  ✓ Number of statements: {len(ast)}")
    
    process_ast_with_autodiff(ast)
    
    print("\n" + "=" * 60)
    print("Phase 3: C Code Generation")
    print("=" * 60)
    c_codegen = CCodeGenerator()
    c_code = c_codegen.generate(ast)
    print(c_code)
    
    print("\n" + "=" * 60)
    print("Phase 4: Compiling to Executable")
    print("=" * 60)
    generate_executable_from_c(c_code, output_file)
    
    print("\n" + "=" * 60)
    print("Compilation Complete!")
    print("=" * 60)

if __name__ == "__main__":
    main()

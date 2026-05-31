#!/usr/bin/env python3
import sys
import os
from lexer import Lexer
from parser import Parser
from codegen import CodeGenerator, compile_ir, generate_executable

def main():
    if len(sys.argv) < 2:
        print("Usage: python llvm_compiler.py <input_file> [output_file]")
        print("Example: python llvm_compiler.py example.math output")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else 'output'
    
    try:
        import llvmlite
        print(f"Using llvmlite version: {llvmlite.__version__}")
    except ImportError:
        print("Error: llvmlite is not installed.")
        print("Install it with: pip install llvmlite")
        sys.exit(1)
    
    try:
        with open(input_file, 'r') as f:
            source = f.read()
    except FileNotFoundError:
        print(f"Error: File '{input_file}' not found")
        sys.exit(1)
    
    print("\n" + "="*60)
    print("Phase 1: Lexical Analysis (Tokenization)")
    print("="*60)
    lexer = Lexer(source)
    tokens = lexer.tokenize()
    for token in tokens[:-1]:
        print(token)
    
    print("\n" + "="*60)
    print("Phase 2: Syntax Analysis (Parsing)")
    print("="*60)
    parser = Parser(tokens)
    ast = parser.parse()
    print(f"✓ AST generated successfully with {len(ast)} statements")
    
    print("\n" + "="*60)
    print("Phase 3: LLVM IR Code Generation")
    print("="*60)
    try:
        codegen = CodeGenerator()
        llvm_module = codegen.generate(ast)
        print("✓ LLVM IR generated successfully")
        print("\nLLVM IR Output:")
        print("-"*60)
        print(llvm_module)
        print("-"*60)
        
        with open(output_file + '.ll', 'w') as f:
            f.write(str(llvm_module))
        print(f"\n✓ LLVM IR saved to: {output_file}.ll")
    except Exception as e:
        print(f"✗ Error during LLVM code generation: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    
    print("\n" + "="*60)
    print("Phase 4: Compiling to Object File")
    print("="*60)
    try:
        mod, target_machine = compile_ir(llvm_module)
        print(f"✓ Module verified successfully")
        print(f"  Target triple: {mod.triple}")
    except Exception as e:
        print(f"✗ Error compiling IR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
    
    print("\n" + "="*60)
    print("Phase 5: Linking to Executable")
    print("="*60)
    try:
        generate_executable(mod, target_machine, output_file)
    except Exception as e:
        print(f"Warning: {e}")
        print("You can still use the generated .ll file with:")
        print(f"  llc -filetype=obj {output_file}.ll -o {output_file}.o")
        print(f"  gcc {output_file}.o -o {output_file}.exe -lm")
    
    print("\n" + "="*60)
    print("Compilation Complete!")
    print("="*60)

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
import requests
import time
import sys

BASE_URL = "http://localhost:8080"

def test_health():
    print("1. 测试健康检查...")
    try:
        response = requests.get(f"{BASE_URL}/health")
        print(f"   状态码: {response.status_code}")
        print(f"   响应: {response.json()}")
        return response.status_code == 200
    except Exception as e:
        print(f"   错误: {e}")
        return False

def test_upload(wasm_path):
    print(f"\n2. 上传Wasm文件: {wasm_path}")
    try:
        with open(wasm_path, 'rb') as f:
            files = {'wasm': f}
            response = requests.post(f"{BASE_URL}/upload", files=files)
        print(f"   状态码: {response.status_code}")
        result = response.json()
        print(f"   响应: {result}")
        return result.get('id')
    except Exception as e:
        print(f"   错误: {e}")
        return None

def test_execute(func_id, function_name, input_val):
    print(f"\n3. 执行函数 {function_name}({input_val})...")
    try:
        data = {
            "function": function_name,
            "input": input_val
        }
        start_time = time.time()
        response = requests.post(f"{BASE_URL}/execute/{func_id}", json=data)
        elapsed = (time.time() - start_time) * 1000
        
        print(f"   状态码: {response.status_code}")
        print(f"   实际耗时: {elapsed:.2f}ms")
        result = response.json()
        print(f"   响应: {result}")
        return result
    except Exception as e:
        print(f"   错误: {e}")
        return None

def main():
    print("=== Wasm FaaS 平台测试 ===\n")
    
    wasm_path = "examples/rust/target/wasm32-unknown-unknown/release/wasm_math.wasm"
    
    if len(sys.argv) > 1:
        wasm_path = sys.argv[1]
    
    print(f"使用Wasm文件: {wasm_path}\n")
    
    if not test_health():
        print("\n错误: 服务器未启动，请先运行: go run cmd/server/main.go")
        return
    
    func_id = test_upload(wasm_path)
    if not func_id:
        print("\n错误: 上传失败")
        return
    
    test_execute(func_id, "calculate", 10)
    test_execute(func_id, "fibonacci", 20)
    test_execute(func_id, "factorial", 10)
    test_execute(func_id, "square", 42)
    
    print("\n4. 测试超时 (infinite_loop)...")
    result = test_execute(func_id, "infinite_loop", 0)
    if result and 'error' in result:
        print(f"   ✓ 超时机制正常工作: {result['error']}")
    
    print("\n=== 测试完成 ===")

if __name__ == "__main__":
    main()

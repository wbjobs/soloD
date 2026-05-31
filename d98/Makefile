.PHONY: all build wasm run test clean help

all: build wasm

help:
	@echo "可用的目标:"
	@echo "  build    - 构建Go服务器"
	@echo "  wasm     - 编译Rust Wasm示例"
	@echo "  run      - 运行Go服务器"
	@echo "  test     - 运行快速测试"
	@echo "  clean    - 清理构建产物"
	@echo "  deps     - 安装依赖"

deps:
	go mod tidy
	rustup target add wasm32-unknown-unknown

build:
	go build -o bin/server cmd/server/main.go

wasm:
	cd examples/rust && cargo build --release --target wasm32-unknown-unknown
	@echo "Wasm文件已生成: examples/rust/target/wasm32-unknown-unknown/release/wasm_math.wasm"

run:
	go run cmd/server/main.go

test:
	@echo "=== 启动服务器进行测试 ==="
	@echo "请手动执行以下命令测试:"
	@echo ""
	@echo "1. 上传Wasm:"
	@echo "   curl -X POST -F \"wasm=@examples/rust/target/wasm32-unknown-unknown/release/wasm_math.wasm\" http://localhost:8080/upload"
	@echo ""
	@echo "2. 执行计算:"
	@echo "   curl -X POST -H \"Content-Type: application/json\" -d '{\"function\":\"calculate\",\"input\":10}' http://localhost:8080/execute/<ID>"
	@echo ""

clean:
	rm -rf bin/
	rm -rf uploads/*
	cd examples/rust && cargo clean

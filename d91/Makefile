.PHONY: all build build-ebpf build-user build-web clean run run-backend run-frontend install-deps

VERSION := 0.1.0

# Default target
all: build

# Build everything
build: build-ebpf build-user build-web

# Build eBPF program
build-ebpf:
	@echo "Building eBPF program..."
	@if ! command -v cargo-ebpf &> /dev/null; then \
		echo "Installing cargo-ebpf..."; \
		cargo install cargo-ebpf; \
	fi
	cd ebpf && cargo ebpf build --release
	mkdir -p target/release
	cp ebpf/target/bpfel-unknown-none/release/secmon-ebpf target/release/secmon-ebpf.o
	@echo "eBPF program built: target/release/secmon-ebpf.o"

# Build user-space backend
build-user:
	@echo "Building user-space backend..."
	cd user && cargo build --release

# Build frontend
build-web:
	@echo "Building frontend..."
	cd web && npm install && npm run build

# Clean build artifacts
clean:
	@echo "Cleaning build artifacts..."
	cargo clean
	cd web && rm -rf node_modules build .svelte-kit

# Run the backend (requires root privileges)
run-backend:
	@echo "Running backend (requires root)..."
	sudo ./target/release/secmon

# Run the frontend development server
run-frontend:
	@echo "Running frontend development server..."
	cd web && npm run dev

# Run both backend and frontend
run:
	@echo "Starting services..."
	@echo "Backend: http://localhost:3030"
	@echo "Frontend: http://localhost:5173"
	@echo ""
	@echo "Run 'make run-backend' in one terminal (as root)"
	@echo "Run 'make run-frontend' in another terminal"

# Install dependencies
install-deps:
	@echo "Installing dependencies..."
	@echo "Rust dependencies:"
	cargo fetch
	@echo ""
	@echo "Node.js dependencies:"
	cd web && npm install

# Install required system packages (Ubuntu/Debian)
install-system-deps:
	@echo "Installing system dependencies (Ubuntu/Debian)..."
	sudo apt-get update
	sudo apt-get install -y \
		build-essential \
		clang \
		llvm \
		libelf-dev \
		linux-headers-$(shell uname -r) \
		pkg-config

# Show help
help:
	@echo "Security Monitor - eBPF Syscall Tracer"
	@echo ""
	@echo "Usage:"
	@echo "  make build              Build all components"
	@echo "  make build-ebpf         Build eBPF program"
	@echo "  make build-user         Build user-space backend"
	@echo "  make build-web          Build frontend"
	@echo "  make run-backend        Run backend (requires root)"
	@echo "  make run-frontend       Run frontend dev server"
	@echo "  make install-deps       Install project dependencies"
	@echo "  make install-system-deps Install system packages (Ubuntu/Debian)"
	@echo "  make clean              Clean build artifacts"
	@echo ""
	@echo "Requirements:"
	@echo "  - Linux kernel >= 5.8"
	@echo "  - Rust >= 1.70"
	@echo "  - Node.js >= 18"
	@echo "  - Clang/LLVM for eBPF compilation"

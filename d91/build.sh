#!/bin/bash
set -e

echo "========================================"
echo "Security Monitor - Build Script"
echo "========================================"

# Check if we're on Linux
if [[ "$(uname)" != "Linux" ]]; then
    echo "ERROR: This project must be built on Linux!"
    exit 1
fi

# Check for required tools
check_dependency() {
    if ! command -v "$1" &> /dev/null; then
        echo "ERROR: $1 not found. Please install it first."
        exit 1
    fi
}

echo "Checking dependencies..."
check_dependency "cargo"
check_dependency "node"
check_dependency "npm"
check_dependency "clang"
echo "All dependencies found!"
echo ""

# Build eBPF program
echo "[1/3] Building eBPF program..."
cd ebpf
cargo build --release
cd ..
echo "eBPF program built successfully!"
echo ""

# Build user-space backend
echo "[2/3] Building user-space backend..."
cd user
cargo build --release
cd ..
echo "User-space backend built successfully!"
echo ""

# Build frontend
echo "[3/3] Building frontend..."
cd web
if [ ! -d "node_modules" ]; then
    echo "Installing npm dependencies..."
    npm install
fi
npm run build
cd ..
echo "Frontend built successfully!"
echo ""

echo "========================================"
echo "Build completed successfully!"
echo "========================================"
echo ""
echo "To run the backend (requires root):"
echo "  sudo ./target/release/secmon"
echo ""
echo "To run specific PIDs (e.g., PIDs 1234 and 5678):"
echo "  sudo ./target/release/secmon --pid 1234 --pid 5678"
echo ""
echo "To run the frontend development server:"
echo "  cd web && npm run dev"
echo ""

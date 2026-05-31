#!/bin/bash
set -e

echo "Building eBPF program..."

cd ebpf

# Check if cargo-ebpf is installed
if ! command -v cargo-ebpf &> /dev/null; then
    echo "Installing cargo-ebpf..."
    cargo install cargo-ebpf
fi

# Build using cargo-ebpf
cargo ebpf build --release

# Copy the object file to where the user program expects it
mkdir -p ../target/release
cp target/bpfel-unknown-none/release/secmon-ebpf ../target/release/secmon-ebpf.o

echo "eBPF program built successfully: ../target/release/secmon-ebpf.o"

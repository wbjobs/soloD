.PHONY: all build generate clean help

TARGET ?= ebpf-monitor

all: build

help:
	@echo "Available targets:"
	@echo "  all        - Build the project (default)"
	@echo "  build      - Build the Go binary"
	@echo "  generate   - Generate eBPF Go bindings using bpf2go"
	@echo "  clean      - Clean build artifacts"
	@echo "  deps       - Install dependencies"
	@echo "  run        - Run the monitor (requires sudo and PID)"

deps:
	go mod download
	go install github.com/cilium/ebpf/cmd/bpf2go@latest

generate:
	cd ebpf && go generate

build: generate
	go build -o $(TARGET) ./cmd

clean:
	rm -f $(TARGET)
	rm -f ebpf/*_bpf*
	rm -f ebpf/*_bpfel.*
	rm -f ebpf/*_bpfeb.*

run: build
	sudo ./$(TARGET) -pid=$(PID)

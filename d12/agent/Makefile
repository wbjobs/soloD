.PHONY: all build bpf proto clean

export CGO_ENABLED=1
export GOOS=linux
export GOARCH=amd64
export CGO_CFLAGS=-I/usr/include/bpf
export CGO_LDFLAGS=-lbpf -lelf -lz

all: build

bpf:
	clang -O2 -target bpf -D__TARGET_ARCH_x86_64 \
		-I/usr/include \
		-I/usr/include/x86_64-linux-gnu \
		-c bpf/syscall.bpf.c -o bpf/syscall.bpf.o

proto:
	cd .. && protoc --go_out=agent/proto --go_opt=paths=source_relative \
		--go-grpc_out=agent/proto --go-grpc_opt=paths=source_relative \
		proto/syscall.proto

deps:
	go mod download
	go get github.com/aquasecurity/libbpfgo
	go get google.golang.org/grpc
	go get google.golang.org/protobuf

build: bpf
	go build -v -o syscall-agent main.go

build-static: bpf
	CGO_LDFLAGS="-lbpf -lelf -lz -static" go build -v -o syscall-agent main.go

clean:
	rm -f syscall-agent
	rm -f bpf/syscall.bpf.o
	rm -f proto/*.pb.go

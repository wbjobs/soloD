.PHONY: all clean generate

CLANG ?= clang
CFLAGS := -O2 -g -Wall -Werror $(CFLAGS)

all: generate

generate: export BPF_CLANG := $(CLANG)
generate: export BPF_CFLAGS := $(CFLAGS)
generate:
	go generate ./...

clean:
	rm -f bpf_bpfeb.go bpf_bpfeb.o bpf_bpfel.go bpf_bpfel.o

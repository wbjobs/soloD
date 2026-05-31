package main

/*
#cgo CFLAGS: -I/usr/include/bpf
#cgo LDFLAGS: -lbpf -lelf -lz
*/
import "C"

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"unsafe"

	"github.com/aquasecurity/libbpfgo"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	pb "syscall-agent/proto"
)

type event struct {
	Pid         uint32
	Comm        [16]byte
	SyscallName [32]byte
	Args        [256]byte
	Timestamp   uint64
} // must match packed C struct layout

func main() {
	if len(os.Args) < 2 {
		fmt.Printf("Usage: %s <pid> [collector-address]\n", os.Args[0])
		fmt.Printf("Example: %s 1234 localhost:50051\n", os.Args[0])
		os.Exit(1)
	}

	targetPidStr := os.Args[1]
	collectorAddr := "localhost:50051"
	if len(os.Args) > 2 {
		collectorAddr = os.Args[2]
	}

	targetPid, err := strconv.ParseUint(targetPidStr, 10, 32)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Invalid PID: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("Starting syscall monitor for PID %d...\n", targetPid)
	fmt.Printf("Connecting to collector at %s...\n", collectorAddr)

	conn, err := grpc.Dial(collectorAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to connect to collector: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close()

	client := pb.NewSyscallCollectorClient(conn)
	stream, err := client.StreamSyscalls(context.Background())
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to create stream: %v\n", err)
		os.Exit(1)
	}
	defer stream.CloseAndRecv()

	fmt.Println("Connected to collector successfully")

	bpfModule, err := libbpfgo.NewModuleFromFile("bpf/syscall.bpf.o")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to load BPF module: %v\n", err)
		os.Exit(1)
	}
	defer bpfModule.Close()

	err = bpfModule.BPFLoadObject()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to load BPF object: %v\n", err)
		os.Exit(1)
	}

	err = bpfModule.InitGlobalVariable("target_pid", uint32(targetPid))
	if err != nil {
		fmt.Fprintf(os.Stderr, "Warning: Could not set target_pid: %v\n", err)
	}

	progOpenat, err := bpfModule.GetProgram("tracepoint_sys_enter_openat")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to get openat program: %v\n", err)
		os.Exit(1)
	}

	progRead, err := bpfModule.GetProgram("tracepoint_sys_enter_read")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to get read program: %v\n", err)
		os.Exit(1)
	}

	_, err = progOpenat.AttachTracepoint("syscalls", "sys_enter_openat")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to attach openat tracepoint: %v\n", err)
		os.Exit(1)
	}

	_, err = progRead.AttachTracepoint("syscalls", "sys_enter_read")
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to attach read tracepoint: %v\n", err)
		os.Exit(1)
	}

	rb, err := bpfModule.InitRingBuf("events", nil)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to init ring buffer: %v\n", err)
		os.Exit(1)
	}
	defer rb.Close()

	eventCount := 0
	rb.SetCallback(func(data []byte) {
		e := (*event)(unsafe.Pointer(&data[0]))
		
		comm := C.GoString((*C.char)(unsafe.Pointer(&e.Comm)))
		syscallName := C.GoString((*C.char)(unsafe.Pointer(&e.SyscallName)))
		args := C.GoString((*C.char)(unsafe.Pointer(&e.Args)))
		
		event := &pb.SyscallEvent{
			Pid:         e.Pid,
			ProcessName: comm,
			SyscallName: syscallName,
			Args:        args,
			Timestamp:   int64(e.Timestamp),
		}
		
		if err := stream.Send(event); err != nil {
			fmt.Fprintf(os.Stderr, "Failed to send event: %v\n", err)
		}
		
		eventCount++
		if eventCount%10 == 0 {
			fmt.Printf("Sent %d events...\n", eventCount)
		}
	})

	rb.Start()

	fmt.Println("Monitoring started. Press Ctrl+C to stop.")

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	fmt.Println("\nStopping...")
	rb.Stop()
	fmt.Printf("Total events sent: %d\n", eventCount)
}

//go:build linux
// +build linux

package ebpf

import (
	"bytes"
	"context"
	"encoding/binary"
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"github.com/cilium/ebpf"
	"github.com/cilium/ebpf/link"
	"github.com/cilium/ebpf/ringbuf"
	"github.com/cilium/ebpf/rlimit"
)

//go:generate go run github.com/cilium/ebpf/cmd/bpf2go -cc clang -cflags "-O2 -g -Wall -Werror" cpulimit cpu_limit.c

var (
	ErrNotSupported    = errors.New("eBPF not supported on this kernel")
	ErrNoPermissions   = errors.New("insufficient permissions to load eBPF program")
	ErrMemoryLimit     = errors.New("memory quota exceeded (5MB limit)")
	ErrCPUTimeLimit    = errors.New("CPU time limit exceeded (100ms limit)")
)

const (
	EventTypeCPUTimeout  = 1
	EventTypeMemoryLimit = 2
	MemoryLimitBytes     = 5 * 1024 * 1024 // 5MB
	CPUTimeoutMs         = 100
)

type ProcessEvent struct {
	PID       int
	PGID      int
	CPUNs     uint64
	MemBytes  uint64
	EventType int
	Killed    bool
}

type CPUMonitor struct {
	objs           cpulimitObjects
	schedLink      link.Link
	exitLink       link.Link
	forkLink       link.Link
	mmapLink       link.Link
	munmapLink     link.Link
	brkLink        link.Link
	mremapLink     link.Link
	reader         *ringbuf.Reader
	stopChan       chan struct{}
	eventChan      chan ProcessEvent
	monitoredPGIDs map[int]bool
	running        bool
}

func NewCPUMonitor() (*CPUMonitor, error) {
	if err := rlimit.RemoveMemlock(); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrNoPermissions, err)
	}

	if err := checkKernelVersion(); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrNotSupported, err)
	}

	objs := cpulimitObjects{}
	if err := loadCpulimitObjects(&objs, nil); err != nil {
		if errors.Is(err, ebpf.ErrNotSupported) {
			return nil, fmt.Errorf("%w: eBPF not supported", ErrNotSupported)
		}
		var verr *ebpf.VerifierError
		if errors.As(err, &verr) {
			return nil, fmt.Errorf("BPF verifier error: %w\n%s", err, verr.Error())
		}
		return nil, fmt.Errorf("failed to load BPF objects: %w (run go generate pkg/ebpf)", err)
	}

	schedLink, err := link.Tracepoint("sched", "sched_switch", objs.TracepointSchedSchedSwitch, nil)
	if err != nil {
		objs.Close()
		return nil, fmt.Errorf("attaching sched_switch: %w", err)
	}

	exitLink, err := link.Tracepoint("sched", "sched_process_exit", objs.TracepointSchedSchedProcessExit, nil)
	if err != nil {
		schedLink.Close()
		objs.Close()
		return nil, fmt.Errorf("attaching sched_process_exit: %w", err)
	}

	forkLink, err := link.Tracepoint("sched", "sched_process_fork", objs.TracepointSchedSchedProcessFork, nil)
	if err != nil {
		exitLink.Close()
		schedLink.Close()
		objs.Close()
		return nil, fmt.Errorf("attaching sched_process_fork: %w", err)
	}

	mmapLink, err := link.Tracepoint("syscalls", "sys_enter_mmap", objs.TracepointSyscallsSysEnterMmap, nil)
	if err != nil {
		forkLink.Close()
		exitLink.Close()
		schedLink.Close()
		objs.Close()
		return nil, fmt.Errorf("attaching sys_enter_mmap: %w", err)
	}

	munmapLink, err := link.Tracepoint("syscalls", "sys_enter_munmap", objs.TracepointSyscallsSysEnterMunmap, nil)
	if err != nil {
		mmapLink.Close()
		forkLink.Close()
		exitLink.Close()
		schedLink.Close()
		objs.Close()
		return nil, fmt.Errorf("attaching sys_enter_munmap: %w", err)
	}

	brkLink, err := link.Tracepoint("syscalls", "sys_enter_brk", objs.TracepointSyscallsSysEnterBrk, nil)
	if err != nil {
		munmapLink.Close()
		mmapLink.Close()
		forkLink.Close()
		exitLink.Close()
		schedLink.Close()
		objs.Close()
		return nil, fmt.Errorf("attaching sys_enter_brk: %w", err)
	}

	mremapLink, err := link.Tracepoint("syscalls", "sys_enter_mremap", objs.TracepointSyscallsSysEnterMremap, nil)
	if err != nil {
		brkLink.Close()
		munmapLink.Close()
		mmapLink.Close()
		forkLink.Close()
		exitLink.Close()
		schedLink.Close()
		objs.Close()
		return nil, fmt.Errorf("attaching sys_enter_mremap: %w", err)
	}

	reader, err := ringbuf.NewReader(objs.Events)
	if err != nil {
		mremapLink.Close()
		brkLink.Close()
		munmapLink.Close()
		mmapLink.Close()
		forkLink.Close()
		exitLink.Close()
		schedLink.Close()
		objs.Close()
		return nil, fmt.Errorf("creating ringbuf reader: %w", err)
	}

	return &CPUMonitor{
		objs:           objs,
		schedLink:      schedLink,
		exitLink:       exitLink,
		forkLink:       forkLink,
		mmapLink:       mmapLink,
		munmapLink:     munmapLink,
		brkLink:        brkLink,
		mremapLink:     mremapLink,
		reader:         reader,
		stopChan:       make(chan struct{}),
		eventChan:      make(chan ProcessEvent, 100),
		monitoredPGIDs: make(map[int]bool),
	}, nil
}

func (m *CPUMonitor) Start() error {
	if m.running {
		return errors.New("monitor already running")
	}
	m.running = true
	go m.eventLoop()
	return nil
}

func (m *CPUMonitor) Stop() {
	if !m.running {
		return
	}
	m.running = false
	close(m.stopChan)
	m.reader.Close()
	m.mremapLink.Close()
	m.brkLink.Close()
	m.munmapLink.Close()
	m.mmapLink.Close()
	m.forkLink.Close()
	m.exitLink.Close()
	m.schedLink.Close()
	m.objs.Close()
}

func (m *CPUMonitor) MonitorPGID(pgid int) error {
	flag := uint8(1)
	if err := m.objs.MonitoredPgids.Put(uint32(pgid), &flag); err != nil {
		return fmt.Errorf("failed to monitor PGID %d: %w", pgid, err)
	}
	m.monitoredPGIDs[pgid] = true
	log.Printf("Started monitoring PGID %d (memory limit: 5MB, CPU limit: 100ms)", pgid)
	return nil
}

func (m *CPUMonitor) UnmonitorPGID(pgid int) error {
	if err := m.objs.MonitoredPgids.Delete(uint32(pgid)); err != nil {
		return fmt.Errorf("failed to unmonitor PGID %d: %w", pgid, err)
	}
	delete(m.monitoredPGIDs, pgid)
	log.Printf("Stopped monitoring PGID %d", pgid)
	return nil
}

func (m *CPUMonitor) EventChannel() <-chan ProcessEvent {
	return m.eventChan
}

func (m *CPUMonitor) eventLoop() {
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)

	for {
		select {
		case <-m.stopChan:
			return
		case <-sig:
			return
		default:
			record, err := m.reader.Read()
			if err != nil {
				if errors.Is(err, ringbuf.ErrClosed) {
					return
				}
				log.Printf("eBPF ringbuf read error: %v", err)
				runtime.Gosched()
				continue
			}

			if len(record.RawSample) < 28 {
				continue
			}

			var event struct {
				Pid       int32
				Pgid      int32
				CPUNs     uint64
				MemBytes  uint64
				EventType uint8
				Killed    uint8
			}

			if err := binary.Read(bytes.NewBuffer(record.RawSample), binary.LittleEndian, &event); err != nil {
				log.Printf("parsing event error: %v", err)
				continue
			}

			if m.monitoredPGIDs[int(event.Pgid)] {
				var limitType string
				switch event.EventType {
				case EventTypeCPUTimeout:
					limitType = "CPU"
					log.Printf("CPU time limit exceeded: PID=%d, PGID=%d, total=%d ms",
						event.Pid, event.Pgid, event.CPUNs/1000000)
				case EventTypeMemoryLimit:
					limitType = "MEMORY"
					log.Printf("Memory limit exceeded: PID=%d, PGID=%d, allocated=%d bytes (%.2f MB)",
						event.Pid, event.Pgid, event.MemBytes, float64(event.MemBytes)/1024/1024)
				default:
					limitType = "UNKNOWN"
				}

				m.eventChan <- ProcessEvent{
					PID:       int(event.Pid),
					PGID:      int(event.Pgid),
					CPUNs:     event.CPUNs,
					MemBytes:  event.MemBytes,
					EventType: int(event.EventType),
					Killed:    event.Killed == 1,
				}
			}
		}
	}
}

func KillProcessGroup(pgid int) error {
	p, err := os.FindProcess(pgid)
	if err != nil {
		return fmt.Errorf("failed to find process group %d: %w", pgid, err)
	}
	
	if err := p.Signal(syscall.SIGKILL); err != nil {
		return fmt.Errorf("failed to kill process group %d: %w", pgid, err)
	}
	log.Printf("Killed process group %d due to limit exceeded", pgid)
	return nil
}

func checkKernelVersion() error {
	var uts syscall.Utsname
	if err := syscall.Uname(&uts); err != nil {
		return err
	}
	
	var major, minor int
	release := uts.Release[:]
	fmt.Sscanf(string(release[:bytes.IndexByte(release[:], 0)]), "%d.%d", &major, &minor)
	
	if major < 5 || (major == 5 && minor < 8) {
		return fmt.Errorf("kernel version %d.%d too old, need >= 5.8", major, minor)
	}
	return nil
}

type Executor struct {
	monitor        *CPUMonitor
	useEbpf        bool
	fallbackActive bool
}

func NewExecutor() (*Executor, error) {
	monitor, err := NewCPUMonitor()
	if err != nil {
		log.Printf("eBPF monitor not available: %v, falling back to process monitoring", err)
		return &Executor{useEbpf: false, fallbackActive: true}, nil
	}
	
	if err := monitor.Start(); err != nil {
		monitor.Stop()
		return nil, err
	}
	
	executor := &Executor{monitor: monitor, useEbpf: true}
	
	go func() {
		for event := range monitor.EventChannel() {
			if event.Killed {
				log.Printf("Resource limit detected, killing PGID %d", event.PGID)
				KillProcessGroup(event.PGID)
			}
		}
	}()
	
	return executor, nil
}

func (e *Executor) ExecuteWithTimeout(cmd *exec.Cmd, timeout time.Duration) error {
	if err := cmd.Start(); err != nil {
		return err
	}

	pgid, err := syscall.Getpgid(cmd.Process.Pid)
	if err != nil {
		pgid = cmd.Process.Pid
	}

	if e.useEbpf {
		e.monitor.MonitorPGID(pgid)
		defer e.monitor.UnmonitorPGID(pgid)
	}

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	done := make(chan error, 1)
	go func() {
		done <- cmd.Wait()
	}()

	select {
	case <-ctx.Done():
		if e.useEbpf {
			KillProcessGroup(pgid)
		} else {
			cmd.Process.Kill()
		}
		return ErrCPUTimeLimit
	case err := <-done:
		return err
	}
}

func (e *Executor) UseEbpf() bool {
	return e.useEbpf
}

func (e *Executor) Stop() {
	if e.useEbpf {
		e.monitor.Stop()
	}
}

func GetMemoryUsage(pid int) (uint64, error) {
	path := fmt.Sprintf("/proc/%d/status", pid)
	data, err := os.ReadFile(path)
	if err != nil {
		return 0, err
	}
	
	lines := bytes.Split(data, []byte("\n"))
	for _, line := range lines {
		if bytes.HasPrefix(line, []byte("VmRSS:")) {
			parts := bytes.Fields(line)
			if len(parts) >= 2 {
				var kb uint64
				fmt.Sscanf(string(parts[1]), "%d", &kb)
				return kb * 1024, nil
			}
		}
	}
	return 0, errors.New("VmRSS not found")
}

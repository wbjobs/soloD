//go:build !linux
// +build !linux

package ebpf

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"runtime"
	"time"
)

var (
	ErrNotSupported  = errors.New("eBPF not supported on this platform, using fallback monitoring")
	ErrNoPermissions = errors.New("insufficient permissions")
	ErrMemoryLimit   = errors.New("memory quota exceeded (5MB limit)")
	ErrCPUTimeLimit  = errors.New("CPU time limit exceeded (100ms limit)")
)

const (
	EventTypeCPUTimeout  = 1
	EventTypeMemoryLimit = 2
	MemoryLimitBytes     = 5 * 1024 * 1024
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
	stopChan       chan struct{}
	eventChan      chan ProcessEvent
	monitoredPIDs  map[int]time.Time
	monitoredMem   map[int]uint64
	running        bool
}

func NewCPUMonitor() (*CPUMonitor, error) {
	return &CPUMonitor{
		stopChan:      make(chan struct{}),
		eventChan:     make(chan ProcessEvent, 100),
		monitoredPIDs: make(map[int]time.Time),
		monitoredMem:  make(map[int]uint64),
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
}

func (m *CPUMonitor) MonitorPGID(pgid int) error {
	m.monitoredPIDs[pgid] = time.Now()
	m.monitoredMem[pgid] = 0
	return nil
}

func (m *CPUMonitor) UnmonitorPGID(pgid int) error {
	delete(m.monitoredPIDs, pgid)
	delete(m.monitoredMem, pgid)
	return nil
}

func (m *CPUMonitor) EventChannel() <-chan ProcessEvent {
	return m.eventChan
}

func (m *CPUMonitor) eventLoop() {
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-m.stopChan:
			return
		case <-ticker.C:
			now := time.Now()
			for pid, startTime := range m.monitoredPIDs {
				elapsed := now.Sub(startTime)
				
				memUsage := getProcessMemory(pid)
				m.monitoredMem[pid] = memUsage
				
				if memUsage >= MemoryLimitBytes {
					m.eventChan <- ProcessEvent{
						PID:       pid,
						PGID:      pid,
						MemBytes:  memUsage,
						EventType: EventTypeMemoryLimit,
						Killed:    true,
					}
					delete(m.monitoredPIDs, pid)
					delete(m.monitoredMem, pid)
					continue
				}
				
				if elapsed >= CPUTimeoutMs*time.Millisecond {
					m.eventChan <- ProcessEvent{
						PID:       pid,
						PGID:      pid,
						CPUNs:     uint64(elapsed.Nanoseconds()),
						EventType: EventTypeCPUTimeout,
						Killed:    true,
					}
					delete(m.monitoredPIDs, pid)
					delete(m.monitoredMem, pid)
				}
			}
		}
	}
}

func getProcessMemory(pid int) uint64 {
	if runtime.GOOS == "windows" {
		return 0
	}
	
	path := fmt.Sprintf("/proc/%d/status", pid)
	data, err := os.ReadFile(path)
	if err != nil {
		return 0
	}
	
	for _, line := range bytes.Split(data, []byte("\n")) {
		if bytes.HasPrefix(line, []byte("VmRSS:")) {
			parts := bytes.Fields(line)
			if len(parts) >= 2 {
				var kb uint64
				fmt.Sscanf(string(parts[1]), "%d", &kb)
				return kb * 1024
			}
		}
	}
	return 0
}

func KillProcess(pid int) error {
	process, err := os.FindProcess(pid)
	if err != nil {
		return fmt.Errorf("failed to find process %d: %w", pid, err)
	}
	return process.Kill()
}

func KillProcessGroup(pgid int) error {
	process, err := os.FindProcess(pgid)
	if err != nil {
		return fmt.Errorf("failed to find process group %d: %w", pgid, err)
	}
	return process.Kill()
}

type Executor struct {
	monitor        *CPUMonitor
	useEbpf        bool
	fallbackActive bool
}

func NewExecutor() (*Executor, error) {
	monitor, err := NewCPUMonitor()
	if err != nil {
		return nil, err
	}
	if err := monitor.Start(); err != nil {
		return nil, err
	}
	
	executor := &Executor{monitor: monitor, useEbpf: false, fallbackActive: true}
	
	go func() {
		for event := range monitor.EventChannel() {
			if event.Killed {
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

	pid := cmd.Process.Pid
	e.monitor.MonitorPGID(pid)
	defer e.monitor.UnmonitorPGID(pid)

	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()

	done := make(chan error, 1)
	go func() {
		done <- cmd.Wait()
	}()

	select {
	case <-ctx.Done():
		KillProcess(pid)
		return ErrCPUTimeLimit
	case err := <-done:
		return err
	}
}

func (e *Executor) UseEbpf() bool {
	return e.useEbpf
}

func (e *Executor) Stop() {
	e.monitor.Stop()
}

func GetMemoryUsage(pid int) (uint64, error) {
	return getProcessMemory(pid), nil
}

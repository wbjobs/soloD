package ebpf

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"unsafe"

	"github.com/cilium/ebpf"
	"github.com/cilium/ebpf/link"
	"github.com/cilium/ebpf/ringbuf"
	"ebpf-monitor/pkg/logger"
)

//go:generate go run github.com/cilium/ebpf/cmd/bpf2go -cc clang-14 monitor monitor.bpf.c -- -I../headers -O2 -g

type MonitorObjects struct {
	Events      *ebpf.Map     `ebpf:"events"`
	TargetPids  *ebpf.Map     `ebpf:"target_pids"`
	SeqCounters *ebpf.Map     `ebpf:"seq_counters"`
	Openat      *ebpf.Program `ebpf:"tracepoint_openat"`
	Execve      *ebpf.Program `ebpf:"tracepoint_execve"`
}

type MonitorLinks struct {
	Openat link.Link
	Execve link.Link
}

type BpfEvent struct {
	Timestamp uint64
	Sequence  uint64
	Pid       uint32
	Tgid      uint32
	CpuId     int32
	Syscall   int32
	Comm      [16]byte
	Filename  [256]byte
}

type IgnoreRuleKey struct {
	Prefix [64]byte
}

type IgnoreRuleValue struct {
	RuleType uint32
	Enabled  uint32
}

type IgnoreRule struct {
	PathPrefix string `json:"path_prefix"`
	RuleType   uint32 `json:"rule_type"`
	Enabled    bool   `json:"enabled"`
}

const (
	RuleTypePrefix uint32 = iota
	RuleTypeExact
)

type Stats struct {
	TotalEvents     uint64
	DroppedEvents   uint64
	OutOfOrderCount uint64
	BatchCount      uint64
	LostSequence    uint64
}

type sortableEvent struct {
	event  BpfEvent
	logger *logger.Logger
}

type EbpfMonitor struct {
	objects       MonitorObjects
	links         MonitorLinks
	ringbuf       *ringbuf.Reader
	logger        *logger.Logger
	stopChan      chan struct{}
	targetPid     uint32
	stats         Stats
	lastSeq       uint64
	eventChan     chan BpfEvent
	sortBuffer    []sortableEvent
	sortBufferMux sync.Mutex
	batchSize     int
	wg            sync.WaitGroup
	ctx           context.Context
	cancel        context.CancelFunc
	rulesMutex    sync.RWMutex
	localRules    map[string]IgnoreRule
}

func NewEbpfMonitor(log *logger.Logger, targetPid uint32) (*EbpfMonitor, error) {
	if os.Geteuid() != 0 {
		return nil, errors.New("root privileges required")
	}

	ctx, cancel := context.WithCancel(context.Background())

	monitor := &EbpfMonitor{
		logger:     log,
		stopChan:   make(chan struct{}),
		targetPid:  targetPid,
		eventChan:  make(chan BpfEvent, 10000),
		sortBuffer: make([]sortableEvent, 0, 1000),
		batchSize:  100,
		ctx:        ctx,
		cancel:     cancel,
		localRules: make(map[string]IgnoreRule),
	}

	if err := monitor.load(); err != nil {
		return nil, fmt.Errorf("failed to load eBPF program: %w", err)
	}

	return monitor, nil
}

func (m *EbpfMonitor) load() error {
	spec, err := loadMonitor()
	if err != nil {
		return err
	}

	if err := spec.LoadAndAssign(&m.objects, nil); err != nil {
		return err
	}

	value := uint32(1)
	if err := m.objects.TargetPids.Put(unsafe.Pointer(&m.targetPid), unsafe.Pointer(&value)); err != nil {
		return fmt.Errorf("failed to add target pid: %w", err)
	}

	m.links.Openat, err = link.AttachTracepoint(link.TracepointOptions{
		Program: m.objects.Openat,
	})
	if err != nil {
		return fmt.Errorf("failed to attach openat tracepoint: %w", err)
	}

	m.links.Execve, err = link.AttachTracepoint(link.TracepointOptions{
		Program: m.objects.Execve,
	})
	if err != nil {
		return fmt.Errorf("failed to attach execve tracepoint: %w", err)
	}

	m.ringbuf, err = ringbuf.NewReader(m.objects.Events)
	if err != nil {
		return fmt.Errorf("failed to create ringbuf reader: %w", err)
	}

	return nil
}

func (m *EbpfMonitor) Start() {
	for i := 0; i < 4; i++ {
		m.wg.Add(1)
		go m.worker(i)
	}

	m.wg.Add(1)
	go m.batchProcessor()

	m.wg.Add(1)
	go m.pollEvents()
}

func (m *EbpfMonitor) pollEvents() {
	defer m.wg.Done()

	recordChan := make(chan ringbuf.Record, m.batchSize*2)

	go func() {
		for {
			select {
			case <-m.ctx.Done():
				return
			default:
				record, err := m.ringbuf.Read()
				if err != nil {
					if errors.Is(err, ringbuf.ErrClosed) {
						return
					}
					continue
				}
				recordChan <- record
			}
		}
	}()

	for {
		select {
		case <-m.ctx.Done():
			return
		case record := <-recordChan:
			var event BpfEvent
			if err := binary.Read(&record.RawSample, binary.LittleEndian, &event); err != nil {
				atomic.AddUint64(&m.stats.DroppedEvents, 1)
				continue
			}

			select {
			case m.eventChan <- event:
			default:
				atomic.AddUint64(&m.stats.DroppedEvents, 1)
			}
		}
	}
}

func (m *EbpfMonitor) worker(id int) {
	defer m.wg.Done()

	for {
		select {
		case <-m.ctx.Done():
			return
		case event := <-m.eventChan:
			m.processEvent(event)
		}
	}
}

func (m *EbpfMonitor) processEvent(event BpfEvent) {
	atomic.AddUint64(&m.stats.TotalEvents, 1)

	currentSeq := atomic.LoadUint64(&m.lastSeq)
	if event.Sequence > currentSeq+1 {
		lost := event.Sequence - currentSeq - 1
		atomic.AddUint64(&m.stats.LostSequence, lost)
	}
	atomic.StoreUint64(&m.lastSeq, event.Sequence)

	m.sortBufferMux.Lock()
	m.sortBuffer = append(m.sortBuffer, sortableEvent{
		event:  event,
		logger: m.logger,
	})

	if len(m.sortBuffer) >= m.batchSize {
		batch := make([]sortableEvent, len(m.sortBuffer))
		copy(batch, m.sortBuffer)
		m.sortBuffer = m.sortBuffer[:0]
		m.sortBufferMux.Unlock()

		atomic.AddUint64(&m.stats.BatchCount, 1)
		m.sortAndProcessBatch(batch)
	} else {
		m.sortBufferMux.Unlock()
	}
}

func (m *EbpfMonitor) sortAndProcessBatch(batch []sortableEvent) {
	sort.Slice(batch, func(i, j int) bool {
		if batch[i].event.Sequence != batch[j].event.Sequence {
			return batch[i].event.Sequence < batch[j].event.Sequence
		}
		return batch[i].event.Timestamp < batch[j].event.Timestamp
	})

	seen := make(map[uint64]bool)
	for _, se := range batch {
		if seen[se.event.Sequence] {
			continue
		}
		seen[se.event.Sequence] = true

		logEvent := logger.Event{
			PID:        se.event.Pid,
			TGID:       se.event.Tgid,
			Timestamp:  time.Now(),
			KernelTime: se.event.Timestamp,
			Sequence:   se.event.Sequence,
			CPU:        se.event.CpuId,
			Comm:       string(bytesTrimRightZero(se.event.Comm[:])),
			Filename:   string(bytesTrimRightZero(se.event.Filename[:])),
			Syscall:    getSyscallName(se.event.Syscall),
		}
		se.logger.AddEvent(logEvent)
	}
}

func bytesTrimRightZero(b []byte) []byte {
	for i := len(b) - 1; i >= 0; i-- {
		if b[i] != 0 {
			return b[:i+1]
		}
	}
	return b[:0]
}

func (m *EbpfMonitor) batchProcessor() {
	defer m.wg.Done()

	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-m.ctx.Done():
			m.flushSortBuffer()
			return
		case <-ticker.C:
			m.flushSortBuffer()
		}
	}
}

func (m *EbpfMonitor) flushSortBuffer() {
	m.sortBufferMux.Lock()
	if len(m.sortBuffer) == 0 {
		m.sortBufferMux.Unlock()
		return
	}

	batch := make([]sortableEvent, len(m.sortBuffer))
	copy(batch, m.sortBuffer)
	m.sortBuffer = m.sortBuffer[:0]
	m.sortBufferMux.Unlock()

	if len(batch) > 0 {
		m.sortAndProcessBatch(batch)
	}
}

func getSyscallName(t int32) string {
	switch t {
	case 0:
		return "openat"
	case 1:
		return "execve"
	default:
		return "unknown"
	}
}

func (m *EbpfMonitor) AddTargetPid(pid uint32) error {
	value := uint32(1)
	return m.objects.TargetPids.Put(unsafe.Pointer(&pid), unsafe.Pointer(&value))
}

func (m *EbpfMonitor) RemoveTargetPid(pid uint32) error {
	return m.objects.TargetPids.Delete(unsafe.Pointer(&pid))
}

func (m *EbpfMonitor) GetStats() Stats {
	return Stats{
		TotalEvents:     atomic.LoadUint64(&m.stats.TotalEvents),
		DroppedEvents:   atomic.LoadUint64(&m.stats.DroppedEvents),
		OutOfOrderCount: atomic.LoadUint64(&m.stats.OutOfOrderCount),
		BatchCount:      atomic.LoadUint64(&m.stats.BatchCount),
		LostSequence:    atomic.LoadUint64(&m.stats.LostSequence),
	}
}

func (m *EbpfMonitor) AddIgnoreRule(rule IgnoreRule) error {
	m.rulesMutex.Lock()
	defer m.rulesMutex.Unlock()

	if len(rule.PathPrefix) == 0 || len(rule.PathPrefix) > 63 {
		return fmt.Errorf("path prefix length must be between 1 and 63 characters")
	}

	key := IgnoreRuleKey{}
	copy(key.Prefix[:], rule.PathPrefix)
	key.Prefix[len(rule.PathPrefix)] = 0

	value := IgnoreRuleValue{
		RuleType: rule.RuleType,
		Enabled:  0,
	}
	if rule.Enabled {
		value.Enabled = 1
	}

	if err := m.objects.IgnoreRules.Put(unsafe.Pointer(&key), unsafe.Pointer(&value)); err != nil {
		return fmt.Errorf("failed to add ignore rule to BPF map: %w", err)
	}

	m.localRules[rule.PathPrefix] = rule
	return nil
}

func (m *EbpfMonitor) RemoveIgnoreRule(pathPrefix string) error {
	m.rulesMutex.Lock()
	defer m.rulesMutex.Unlock()

	key := IgnoreRuleKey{}
	copy(key.Prefix[:], pathPrefix)
	key.Prefix[len(pathPrefix)] = 0

	if err := m.objects.IgnoreRules.Delete(unsafe.Pointer(&key)); err != nil {
		return fmt.Errorf("failed to delete ignore rule from BPF map: %w", err)
	}

	delete(m.localRules, pathPrefix)
	return nil
}

func (m *EbpfMonitor) GetIgnoreRules() []IgnoreRule {
	m.rulesMutex.RLock()
	defer m.rulesMutex.RUnlock()

	rules := make([]IgnoreRule, 0, len(m.localRules))
	for _, rule := range m.localRules {
		rules = append(rules, rule)
	}
	return rules
}

func (m *EbpfMonitor) ClearAllIgnoreRules() error {
	m.rulesMutex.Lock()
	defer m.rulesMutex.Unlock()

	for prefix := range m.localRules {
		key := IgnoreRuleKey{}
		copy(key.Prefix[:], prefix)
		key.Prefix[len(prefix)] = 0
		m.objects.IgnoreRules.Delete(unsafe.Pointer(&key))
	}

	m.localRules = make(map[string]IgnoreRule)
	return nil
}

func (m *EbpfMonitor) SaveRulesToFile(filepath string) error {
	m.rulesMutex.RLock()
	defer m.rulesMutex.RUnlock()

	data, err := json.MarshalIndent(m.localRules, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal rules: %w", err)
	}

	if err := os.WriteFile(filepath, data, 0644); err != nil {
		return fmt.Errorf("failed to write rules file: %w", err)
	}

	return nil
}

func (m *EbpfMonitor) LoadRulesFromFile(filepath string) error {
	m.rulesMutex.Lock()
	defer m.rulesMutex.Unlock()

	data, err := os.ReadFile(filepath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("failed to read rules file: %w", err)
	}

	var rules map[string]IgnoreRule
	if err := json.Unmarshal(data, &rules); err != nil {
		return fmt.Errorf("failed to unmarshal rules: %w", err)
	}

	for _, rule := range rules {
		key := IgnoreRuleKey{}
		copy(key.Prefix[:], rule.PathPrefix)
		key.Prefix[len(rule.PathPrefix)] = 0

		value := IgnoreRuleValue{
			RuleType: rule.RuleType,
			Enabled:  0,
		}
		if rule.Enabled {
			value.Enabled = 1
		}

		if err := m.objects.IgnoreRules.Put(unsafe.Pointer(&key), unsafe.Pointer(&value)); err != nil {
			return fmt.Errorf("failed to restore rule %s: %w", rule.PathPrefix, err)
		}

		m.localRules[rule.PathPrefix] = rule
	}

	return nil
}

func (m *EbpfMonitor) Stop() {
	m.cancel()
	m.wg.Wait()

	if m.ringbuf != nil {
		m.ringbuf.Close()
	}
	if m.links.Openat != nil {
		m.links.Openat.Close()
	}
	if m.links.Execve != nil {
		m.links.Execve.Close()
	}
	m.objects.Events.Close()
	m.objects.TargetPids.Close()
	m.objects.SeqCounters.Close()
	m.objects.IgnoreRules.Close()
	m.objects.Openat.Close()
	m.objects.Execve.Close()
	close(m.eventChan)
}

func loadMonitor() (*ebpf.CollectionSpec, error) {
	return nil, errors.New("please run 'go generate' to compile eBPF program first")
}

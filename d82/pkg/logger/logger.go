package logger

import (
	"sort"
	"sync"
	"time"
)

type Event struct {
	PID        uint32    `json:"pid"`
	TGID       uint32    `json:"tgid"`
	Timestamp  time.Time `json:"timestamp"`
	KernelTime uint64    `json:"kernel_time_ns"`
	Sequence   uint64    `json:"sequence"`
	CPU        int32     `json:"cpu"`
	Comm       string    `json:"comm"`
	Filename   string    `json:"filename"`
	Syscall    string    `json:"syscall"`
}

type Logger struct {
	events     []Event
	mu         sync.RWMutex
	maxEvents  int
	lastSeq    uint64
}

func NewLogger() *Logger {
	return &Logger{
		events:    make([]Event, 0),
		maxEvents: 50000,
	}
}

func (l *Logger) AddEvent(event Event) {
	l.mu.Lock()
	defer l.mu.Unlock()
	
	l.events = append(l.events, event)
	if event.Sequence > l.lastSeq {
		l.lastSeq = event.Sequence
	}
	
	if len(l.events) > l.maxEvents {
		trim := len(l.events) - l.maxEvents
		l.events = l.events[trim:]
	}
}

func (l *Logger) GetEvents() []Event {
	l.mu.RLock()
	defer l.mu.RUnlock()
	result := make([]Event, len(l.events))
	copy(result, l.events)
	
	sort.Slice(result, func(i, j int) bool {
		if result[i].Sequence != result[j].Sequence {
			return result[i].Sequence < result[j].Sequence
		}
		return result[i].KernelTime < result[j].KernelTime
	})
	
	return result
}

func (l *Logger) GetEventsByPID(pid uint32) []Event {
	l.mu.RLock()
	defer l.mu.RUnlock()
	var result []Event
	for _, e := range l.events {
		if e.TGID == pid {
			result = append(result, e)
		}
	}
	
	sort.Slice(result, func(i, j int) bool {
		if result[i].Sequence != result[j].Sequence {
			return result[i].Sequence < result[j].Sequence
		}
		return result[i].KernelTime < result[j].KernelTime
	})
	
	return result
}

func (l *Logger) Clear() {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.events = l.events[:0]
}

func (l *Logger) Count() int {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return len(l.events)
}

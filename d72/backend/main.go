package main

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"log"
	"math/rand"
	"net/http"
	"os/user"
	"sort"
	"sync"
	"time"

	"github.com/cilium/ebpf/link"
	"github.com/cilium/ebpf/perf"
	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

//go:generate go run github.com/cilium/ebpf/cmd/bpf2go -cc $BPF_CLANG -cflags $BPF_CFLAGS bpf ./bpf/syscalls.c -- -I./bpf/headers

type SyscallEvent struct {
	PID       uint32 `json:"pid"`
	TGID      uint32 `json:"tgid"`
	Comm      string `json:"comm"`
	Syscall   string `json:"syscall"`
	Path      string `json:"path"`
	Timestamp uint64 `json:"timestamp"`
	Retval    int64  `json:"retval"`
	DurationNs uint64 `json:"duration_ns"`
}

type DurationStats struct {
	Min      uint64   `json:"min"`
	Max      uint64   `json:"max"`
	Avg      float64  `json:"avg"`
	Count    int64    `json:"count"`
	TotalNs  uint64   `json:"total_ns"`
	P50      uint64   `json:"p50"`
	P90      uint64   `json:"p90"`
	P99      uint64   `json:"p99"`
	Histogram []uint64 `json:"histogram"`
}

type FlameGraphNode struct {
	Name     string           `json:"name"`
	Value    int64            `json:"value"`
	Children []FlameGraphNode `json:"children"`
}

type Stats struct {
	mu              sync.RWMutex
	OpenatCount     int64
	ReadCount       int64
	Events          []SyscallEvent
	StartTime       time.Time
	OpenatDurations []uint64
	ReadDurations   []uint64
	PathStats       map[string]*PathDurationStats
}

type PathDurationStats struct {
	Path      string
	Count     int64
	TotalNs   uint64
	DurationNs []uint64
}

var (
	stats = &Stats{
		Events:        make([]SyscallEvent, 0, 1000),
		StartTime:     time.Now(),
		PathStats:     make(map[string]*PathDurationStats),
	}
	globalRand = rand.New(rand.NewSource(time.Now().UnixNano()))
)

func (s *Stats) AddEvent(event SyscallEvent) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if event.Syscall == "openat" {
		s.OpenatCount++
		if event.DurationNs > 0 {
			s.OpenatDurations = append(s.OpenatDurations, event.DurationNs)
		}
	} else if event.Syscall == "read" {
		s.ReadCount++
		if event.DurationNs > 0 {
			s.ReadDurations = append(s.ReadDurations, event.DurationNs)
		}
	}

	if event.DurationNs > 0 && event.Path != "" {
		if _, exists := s.PathStats[event.Path]; !exists {
			s.PathStats[event.Path] = &PathDurationStats{
				Path:       event.Path,
				DurationNs: make([]uint64, 0, 100),
			}
		}
		ps := s.PathStats[event.Path]
		ps.Count++
		ps.TotalNs += event.DurationNs
		ps.DurationNs = append(ps.DurationNs, event.DurationNs)
	}

	s.Events = append(s.Events, event)
	if len(s.Events) > 1000 {
		s.Events = s.Events[1:]
	}
}

func (s *Stats) GetStats() (int64, int64, []SyscallEvent) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	eventsCopy := make([]SyscallEvent, len(s.Events))
	copy(eventsCopy, s.Events)
	return s.OpenatCount, s.ReadCount, eventsCopy
}

func calculateDurationStats(durations []uint64) DurationStats {
	if len(durations) == 0 {
		return DurationStats{
			Histogram: make([]uint64, 10),
		}
	}

	var min, max, total uint64
	min = durations[0]
	for _, d := range durations {
		if d < min {
			min = d
		}
		if d > max {
			max = d
		}
		total += d
	}

	sorted := make([]uint64, len(durations))
	copy(sorted, durations)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })

	p50 := sorted[len(sorted)*50/100]
	p90 := sorted[len(sorted)*90/100]
	p99 := sorted[len(sorted)*99/100]

	histogram := make([]uint64, 10)
	step := (max - min + 1) / 10
	if step == 0 {
		step = 1
	}
	for _, d := range durations {
		idx := int((d - min) / step)
		if idx >= 10 {
			idx = 9
		}
		histogram[idx]++
	}

	return DurationStats{
		Min:       min,
		Max:       max,
		Avg:       float64(total) / float64(len(durations)),
		Count:     int64(len(durations)),
		TotalNs:   total,
		P50:       p50,
		P90:       p90,
		P99:       p99,
		Histogram: histogram,
	}
}

func (s *Stats) GetFlameGraphData() FlameGraphNode {
	s.mu.RLock()
	defer s.mu.RUnlock()

	root := FlameGraphNode{
		Name:  "root",
		Value: s.OpenatCount + s.ReadCount,
		Children: []FlameGraphNode{
			{
				Name:  "openat",
				Value: s.OpenatCount,
				Children: []FlameGraphNode{},
			},
			{
				Name:  "read",
				Value: s.ReadCount,
				Children: []FlameGraphNode{},
			},
		},
	}

	pathMap := make(map[string]map[string]int64)
	for path, ps := range s.PathStats {
		for _, d := range ps.DurationNs {
			var category string
			switch {
			case d < 1000:
				category = "<1us"
			case d < 10000:
				category = "1-10us"
			case d < 100000:
				category = "10-100us"
			case d < 1000000:
				category = "100us-1ms"
			default:
				category = ">1ms"
			}
			
			if _, exists := pathMap[path]; !exists {
				pathMap[path] = make(map[string]int64)
			}
			pathMap[path][category]++
		}
	}

	for path, categories := range pathMap {
		var pathTotal int64
		for _, count := range categories {
			pathTotal += count
		}

		pathNode := FlameGraphNode{
			Name:     path,
			Value:    pathTotal,
			Children: []FlameGraphNode{},
		}

		for cat, count := range categories {
			pathNode.Children = append(pathNode.Children, FlameGraphNode{
				Name:  cat,
				Value: count,
			})
		}

		if pathTotal > 0 {
			if s.OpenatCount > s.ReadCount {
				root.Children[0].Children = append(root.Children[0].Children, pathNode)
			} else {
				root.Children[1].Children = append(root.Children[1].Children, pathNode)
			}
		}
	}

	return root
}

func (s *Stats) GetDurationStats() (DurationStats, DurationStats) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return calculateDurationStats(s.OpenatDurations), calculateDurationStats(s.ReadDurations)
}

func checkRoot() bool {
	currentUser, err := user.Current()
	if err != nil {
		return false
	}
	return currentUser.Uid == "0"
}

func generateMockEvent(syscallType string) SyscallEvent {
	paths := []string{
		"/etc/nginx/nginx.conf",
		"/var/log/nginx/access.log",
		"/usr/share/nginx/html/index.html",
		"/etc/nginx/mime.types",
		"/var/run/nginx.pid",
	}

	duration := uint64(globalRand.Intn(500000) + 1000)
	return SyscallEvent{
		PID:        uint32(globalRand.Intn(1000) + 1000),
		TGID:       uint32(globalRand.Intn(1000) + 1000),
		Comm:       "nginx",
		Syscall:    syscallType,
		Path:       paths[globalRand.Intn(len(paths))],
		Timestamp:  uint64(time.Now().UnixNano()),
		Retval:     int64(globalRand.Intn(100)),
		DurationNs: duration,
	}
}

func startMockDataGenerator() {
	log.Println("Starting mock data generator (eBPF mode disabled)")
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for range ticker.C {
		syscallType := "openat"
		if globalRand.Intn(2) == 1 {
			syscallType = "read"
		}
		event := generateMockEvent(syscallType)
		stats.AddEvent(event)
	}
}

func setupEBPF() bool {
	if !checkRoot() {
		log.Println("Warning: Not running as root, eBPF monitoring will be disabled")
		log.Println("         Running in mock data mode instead")
		return false
	}

	objs := bpfObjects{}
	if err := loadBpfObjects(&objs, nil); err != nil {
		log.Printf("Warning: Failed to load eBPF objects: %v", err)
		log.Println("         Running in mock data mode instead")
		return false
	}

	openatEnter, err := link.Tracepoint("syscalls", "sys_enter_openat", objs.TracepointSysEnterOpenat, nil)
	if err != nil {
		log.Printf("Warning: Failed to link openat enter tracepoint: %v", err)
		objs.Close()
		return false
	}
	defer openatEnter.Close()

	openatExit, err := link.Tracepoint("syscalls", "sys_exit_openat", objs.TracepointSysExitOpenat, nil)
	if err != nil {
		log.Printf("Warning: Failed to link openat exit tracepoint: %v", err)
		objs.Close()
		return false
	}
	defer openatExit.Close()

	readEnter, err := link.Tracepoint("syscalls", "sys_enter_read", objs.TracepointSysEnterRead, nil)
	if err != nil {
		log.Printf("Warning: Failed to link read enter tracepoint: %v", err)
		objs.Close()
		return false
	}
	defer readEnter.Close()

	readExit, err := link.Tracepoint("syscalls", "sys_exit_read", objs.TracepointSysExitRead, nil)
	if err != nil {
		log.Printf("Warning: Failed to link read exit tracepoint: %v", err)
		objs.Close()
		return false
	}
	defer readExit.Close()

	rd, err := perf.NewReader(objs.Events, 4096)
	if err != nil {
		log.Printf("Warning: Failed to create perf reader: %v", err)
		objs.Close()
		return false
	}
	defer rd.Close()

	log.Println("Successfully loaded eBPF program and attached tracepoints")
	log.Println("Monitoring nginx process openat and read syscalls...")

	go func() {
		for {
			record, err := rd.Read()
			if err != nil {
				log.Printf("reading from perf buffer: %v", err)
				continue
			}

			if record.LostSamples != 0 {
				log.Printf("lost %d samples", record.LostSamples)
				continue
			}

			var event bpfEvent
			if err := binary.Read(bytes.NewBuffer(record.RawSample), binary.LittleEndian, &event); err != nil {
				log.Printf("parsing event: %v", err)
				continue
			}

			syscallEvent := SyscallEvent{
				PID:        event.Pid,
				TGID:       event.Tgid,
				Comm:       bytesToString(event.Comm[:]),
				Syscall:    bytesToString(event.Syscall[:]),
				Path:       bytesToString(event.Path[:]),
				Timestamp:  event.Timestamp,
				Retval:     event.Retval,
				DurationNs: event.DurationNs,
			}
			stats.AddEvent(syscallEvent)
		}
	}()

	return true
}

func setupRouter() *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()

	r.Use(gin.Logger())
	r.Use(gin.Recovery())

	config := cors.Config{
		AllowAllOrigins:  true,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}
	r.Use(cors.New(config))

	api := r.Group("/api")
	{
		api.GET("/health", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{
				"status":    "ok",
				"timestamp": time.Now().Unix(),
				"uptime":    time.Since(stats.StartTime).String(),
			})
		})

		api.GET("/stats", func(c *gin.Context) {
			openatCount, readCount, events := stats.GetStats()
			c.Header("Content-Type", "application/json")
			c.JSON(http.StatusOK, gin.H{
				"openat_count": openatCount,
				"read_count":   readCount,
				"events":       events,
				"uptime":       time.Since(stats.StartTime).String(),
			})
		})

		api.GET("/events", func(c *gin.Context) {
			_, _, events := stats.GetStats()
			c.Header("Content-Type", "application/json")
			c.JSON(http.StatusOK, events)
		})

		api.GET("/frequency", func(c *gin.Context) {
			openatCount, readCount, _ := stats.GetStats()
			uptime := time.Since(stats.StartTime).Seconds()
			if uptime < 1 {
				uptime = 1
			}
			c.Header("Content-Type", "application/json")
			c.JSON(http.StatusOK, gin.H{
				"openat_frequency": float64(openatCount) / uptime,
				"read_frequency":   float64(readCount) / uptime,
				"openat_count":     openatCount,
				"read_count":       readCount,
				"uptime_seconds":   uptime,
			})
		})

		api.GET("/duration", func(c *gin.Context) {
			openatStats, readStats := stats.GetDurationStats()
			c.Header("Content-Type", "application/json")
			c.JSON(http.StatusOK, gin.H{
				"openat": openatStats,
				"read":   readStats,
			})
		})

		api.GET("/flamegraph", func(c *gin.Context) {
			flameGraph := stats.GetFlameGraphData()
			c.Header("Content-Type", "application/json")
			c.JSON(http.StatusOK, flameGraph)
		})
	}

	return r
}

func main() {
	log.Println("========================================")
	log.Println("  System Call Monitor - eBPF Backend")
	log.Println("========================================")

	eBPFEnabled := setupEBPF()
	if !eBPFEnabled {
		go startMockDataGenerator()
	}

	r := setupRouter()

	fmt.Println()
	log.Println("Server starting on :8080")
	if eBPFEnabled {
		log.Println("Mode: eBPF kernel tracing (real data)")
	} else {
		log.Println("Mode: Mock data generator (demo mode)")
	}
	log.Println("API Endpoints:")
	log.Println("  GET /api/health      - Health check")
	log.Println("  GET /api/stats       - Full statistics")
	log.Println("  GET /api/events      - Event list")
	log.Println("  GET /api/frequency   - Call frequency")
	log.Println("  GET /api/duration    - Duration statistics")
	log.Println("  GET /api/flamegraph  - Flame graph data")
	log.Println("========================================")

	if err := r.Run(":8080"); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

func bytesToString(b []byte) string {
	for i, c := range b {
		if c == 0 {
			return string(b[:i])
		}
	}
	return string(b)
}

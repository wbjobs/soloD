package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sort"
	"sync"
	"time"

	"github.com/segmentio/kafka-go"
)

const (
	kafkaBroker     = "localhost:9092"
	kafkaTopic       = "logs"
	groupID          = "log-consumer-group"
	batchSize        = 100
	batchTimeout     = 500 * time.Millisecond
	errorThreshold   = 100
	alertWindow      = 60 * time.Second
	webhookURL       = "http://localhost:8080/webhook/alerts"
)

type LogEntry struct {
	ID        string `json:"id"`
	Timestamp string `json:"timestamp"`
	Service   string `json:"service"`
	Level     string `json:"level"`
	Message   string `json:"message"`
	TraceID   string `json:"trace_id"`
	Duration  int    `json:"duration_ms"`
}

type Stats struct {
	mu          sync.Mutex
	total       int
	levelCounts map[string]int
	serviceLogs map[string]int
	errorLogs   map[string]int
}

type AlertPayload struct {
	Type        string   `json:"type"`
	ErrorCount  int      `json:"error_count"`
	Threshold   int      `json:"threshold"`
	TimeWindow  string   `json:"time_window"`
	TopServices []string `json:"top_services"`
	Message     string   `json:"message"`
	Timestamp   string   `json:"timestamp"`
}

func NewStats() *Stats {
	return &Stats{
		levelCounts: make(map[string]int),
		serviceLogs: make(map[string]int),
		errorLogs:   make(map[string]int),
	}
}

func (s *Stats) Add(log *LogEntry) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.total++
	s.levelCounts[log.Level]++
	s.serviceLogs[log.Service]++
	if log.Level == "ERROR" {
		s.errorLogs[log.Service]++
	}
}

func (s *Stats) GetErrorCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	total := 0
	for _, count := range s.errorLogs {
		total += count
	}
	return total
}

func (s *Stats) GetTopErrorServices(n int) []string {
	s.mu.Lock()
	defer s.mu.Unlock()
	
	type serviceError struct {
		name  string
		count int
	}
	
	var services []serviceError
	for name, count := range s.errorLogs {
		services = append(services, serviceError{name, count})
	}
	
	sort.Slice(services, func(i, j int) bool {
		return services[i].count > services[j].count
	})
	
	result := make([]string, 0, n)
	for i := 0; i < n && i < len(services); i++ {
		result = append(result, fmt.Sprintf("%s(%d)", services[i].name, services[i].count))
	}
	return result
}

func (s *Stats) Reset() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.total = 0
	s.levelCounts = make(map[string]int)
	s.serviceLogs = make(map[string]int)
	s.errorLogs = make(map[string]int)
}

func (s *Stats) ResetAndPrint() {
	s.mu.Lock()
	defer s.mu.Unlock()

	fmt.Println("\n========================================")
	fmt.Printf("Log Statistics - %s\n", time.Now().Format("2006-01-02 15:04:05"))
	fmt.Println("========================================")
	fmt.Printf("Total logs processed: %d\n", s.total)
	fmt.Println("\nLog levels:")
	for level, count := range s.levelCounts {
		fmt.Printf("  %-6s: %d\n", level, count)
	}
	fmt.Println("\nServices:")
	for service, count := range s.serviceLogs {
		fmt.Printf("  %-20s: %d\n", service, count)
	}
	fmt.Println("========================================")

	s.total = 0
	s.levelCounts = make(map[string]int)
	s.serviceLogs = make(map[string]int)
	s.errorLogs = make(map[string]int)
}

func sendAlert(errorCount int, topServices []string) error {
	payload := AlertPayload{
		Type:        "ERROR_THRESHOLD_EXCEEDED",
		ErrorCount:  errorCount,
		Threshold:   errorThreshold,
		TimeWindow:  "1 minute",
		TopServices: topServices,
		Message:     fmt.Sprintf("ERROR logs exceeded threshold: %d/%d in the last minute", errorCount, errorThreshold),
		Timestamp:   time.Now().Format(time.RFC3339),
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("failed to marshal alert: %w", err)
	}

	client := &http.Client{
		Timeout: 5 * time.Second,
	}

	resp, err := client.Post(webhookURL, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return fmt.Errorf("failed to send webhook: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("webhook returned non-200 status: %d", resp.StatusCode)
	}

	log.Printf("✅ Alert sent successfully: %d ERROR logs detected", errorCount)
	return nil
}

func main() {
	fmt.Println("Log Consumer started")
	fmt.Printf("Connecting to Kafka: %s, Topic: %s\n", kafkaBroker, kafkaTopic)
	fmt.Printf("Alert configured: ERROR > %d in %v triggers webhook to %s\n", errorThreshold, alertWindow, webhookURL)

	reader := kafka.NewReader(kafka.ReaderConfig{
		Brokers:     []string{kafkaBroker},
		GroupID:      groupID,
		Topic:        kafkaTopic,
		MinBytes:     10e3,
		MaxBytes:     10e6,
		MaxWait:      1 * time.Second,
		StartOffset:  kafka.LastOffset,
	})
	defer reader.Close()

	stats := NewStats()

	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	go func() {
		for range ticker.C {
			errorCount := stats.GetErrorCount()
			if errorCount > errorThreshold {
				topServices := stats.GetTopErrorServices(5)
				log.Printf("🚨 ALERT TRIGGERED: %d ERROR logs detected (threshold: %d)", errorCount, errorThreshold)
				if err := sendAlert(errorCount, topServices); err != nil {
					log.Printf("Failed to send alert: %v", err)
				}
			}
			stats.ResetAndPrint()
		}
	}()

	fmt.Println("Consumer ready. Waiting for messages...")
	fmt.Println("Statistics will be printed every 60 seconds")
	fmt.Println("Using manual offset commit after batch processing")

	ctx := context.Background()

	for {
		var messages []kafka.Message
		var lastMsg kafka.Message
		batchStart := time.Now()

		for len(messages) < batchSize && time.Since(batchStart) < batchTimeout {
			msg, err := reader.FetchMessage(ctx)
			if err != nil {
				if err != context.DeadlineExceeded {
					log.Printf("Error fetching message: %v\n", err)
				}
				break
			}
			messages = append(messages, msg)
			lastMsg = msg
		}

		if len(messages) == 0 {
			continue
		}

		processedCount := 0
		for _, msg := range messages {
			var logEntry LogEntry
			err := json.Unmarshal(msg.Value, &logEntry)
			if err != nil {
				log.Printf("Error parsing JSON: %v\n", err)
				continue
			}
			stats.Add(&logEntry)
			processedCount++
		}

		if processedCount > 0 {
			if err := reader.CommitMessages(ctx, lastMsg); err != nil {
				log.Printf("Error committing offset: %v\n", err)
			}
		}
	}
}

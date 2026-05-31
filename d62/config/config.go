package config

import "time"

const (
	PostgresDSN     = "host=localhost user=postgres password=postgres dbname=deadlock_detector port=5432 sslmode=disable"
	RedisAddr       = "localhost:6379"
	RedisPassword   = ""
	RedisDB         = 0
	TaskStreamName  = "task_stream"
	TaskGroup       = "task_workers"

	DeadlockCheckInterval = 30 * time.Second
	RetryDelayMinutes      = 5 * time.Minute
	MaxRetryCount      = 3
)

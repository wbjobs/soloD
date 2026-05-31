package models

import (
	"time"

	"gorm.io/gorm"
)

type TaskStatus string

const (
	TaskStatusPending   TaskStatus = "pending"
	TaskStatusRunning   TaskStatus = "running"
	TaskStatusCompleted TaskStatus = "completed"
	TaskStatusFailed    TaskStatus = "failed"
	TaskStatusKilled    TaskStatus = "killed"
	TaskStatusRollback  TaskStatus = "rollback"
)

type Task struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	CreatedAt   time.Time      `json:"created_at"`
	UpdatedAt   time.Time      `json:"updated_at"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"deleted_at,omitempty"`
	TaskID      string         `gorm:"uniqueIndex;size:64" json:"task_id"`
	Name        string         `gorm:"size:255" json:"name"`
	Status      TaskStatus     `gorm:"size:32;index" json:"status"`
	Priority    int            `gorm:"default:0;index" json:"priority"`
	WorkerID    string         `gorm:"size:64;index" json:"worker_id,omitempty"`
	StartedAt   *time.Time     `json:"started_at,omitempty"`
	CompletedAt *time.Time     `json:"completed_at,omitempty"`
	RetryCount  int            `gorm:"default:0" json:"retry_count"`
	MaxRetries  int            `gorm:"default:3" json:"max_retries"`
	RunDuration int64          `json:"run_duration"`
	ResourceSize int64         `gorm:"default:0" json:"resource_size"`
}

type TaskDependency struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	CreatedAt time.Time      `json:"created_at"`
	TaskID    string         `gorm:"index;size:64" json:"task_id"`
	DependsOn string         `gorm:"index;size:64" json:"depends_on"`
}

type LockResource struct {
	ID         uint           `gorm:"primaryKey" json:"id"`
	CreatedAt  time.Time      `json:"created_at"`
	UpdatedAt  time.Time      `json:"updated_at"`
	ResourceID string         `gorm:"uniqueIndex;size:128" json:"resource_id"`
	TaskID     string         `gorm:"index;size:64" json:"task_id,omitempty"`
	LockedAt   *time.Time     `json:"locked_at,omitempty"`
	IsLocked   bool           `gorm:"default:false;index" json:"is_locked"`
}

type WaitForLock struct {
	ID         uint           `gorm:"primaryKey" json:"id"`
	CreatedAt  time.Time      `json:"created_at"`
	TaskID     string         `gorm:"index;size:64" json:"task_id"`
	ResourceID string         `gorm:"index;size:128" json:"resource_id"`
	WaitingAt  time.Time      `json:"waiting_at"`
}

type DeadlockAudit struct {
	ID                  uint           `gorm:"primaryKey" json:"id"`
	CreatedAt           time.Time      `json:"created_at"`
	DeadlockID          string         `gorm:"uniqueIndex;size:64" json:"deadlock_id"`
	DetectedAt          time.Time      `json:"detected_at"`
	InvolvedTasks       string         `gorm:"type:text" json:"involved_tasks"`
	InvolvedResources   string         `gorm:"type:text" json:"involved_resources"`
	CycleChain          string         `gorm:"type:text" json:"cycle_chain"`
	AvgWaitDuration     int64          `gorm:"default:0" json:"avg_wait_duration_ms"`
	WaitLevel           string         `gorm:"size:32" json:"wait_level"`
	VictimTaskID        string         `gorm:"size:64" json:"victim_task_id"`
	VictimTaskName      string         `gorm:"size:255" json:"victim_task_name"`
	VictimWaitDuration  int64          `json:"victim_wait_duration_ms"`
	Reason              string         `gorm:"type:text" json:"reason"`
	ResolutionType      string         `gorm:"size:32" json:"resolution_type"`
	AlertTriggered      bool           `gorm:"default:false" json:"alert_triggered"`
	AlertSentAt         *time.Time     `json:"alert_sent_at,omitempty"`
	ResolvedAt          *time.Time     `json:"resolved_at,omitempty"`
	RetryScheduled      bool           `gorm:"default:false" json:"retry_scheduled"`
	RetryDelaySeconds   int            `gorm:"default:300" json:"retry_delay_seconds"`
	RetryAt             *time.Time     `json:"retry_at,omitempty"`
}

type DeadlockStrategyConfig struct {
	ID                     uint      `gorm:"primaryKey" json:"id"`
	CreatedAt              time.Time `json:"created_at"`
	UpdatedAt              time.Time `json:"updated_at"`
	ConfigName             string    `gorm:"uniqueIndex;size:64" json:"config_name"`
	IsActive               bool      `gorm:"default:true" json:"is_active"`

	Level1ThresholdSec     int       `gorm:"default:30" json:"level1_threshold_sec"`
	Level1RetryDelaySec    int       `gorm:"default:10" json:"level1_retry_delay_sec"`
	Level1MarkVictim       bool      `gorm:"default:false" json:"level1_mark_victim"`

	Level2ThresholdSec     int       `gorm:"default:120" json:"level2_threshold_sec"`
	Level2RetryDelaySec    int       `gorm:"default:60" json:"level2_retry_delay_sec"`

	Level3ThresholdSec     int       `gorm:"default:120" json:"level3_threshold_sec"`
	Level3RetryDelaySec    int       `gorm:"default:300" json:"level3_retry_delay_sec"`
	Level3TriggerAlert     bool      `gorm:"default:true" json:"level3_trigger_alert"`

	PredictQueueThreshold  int       `gorm:"default:5" json:"predict_queue_threshold"`
	PredictTrendWindow     int       `gorm:"default:5" json:"predict_trend_window"`
	PredictTrendThreshold  float64   `gorm:"default:0.5" json:"predict_trend_threshold"`
	PredictEnabled         bool      `gorm:"default:true" json:"predict_enabled"`

	DingtalkWebhook        string    `gorm:"size:512" json:"dingtalk_webhook,omitempty"`
	DingtalkSecret         string    `gorm:"size:128" json:"dingtalk_secret,omitempty"`

	Description            string    `gorm:"size:512" json:"description,omitempty"`
}

type WaitTimeHistory struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	CreatedAt   time.Time `json:"created_at"`
	ResourceID  string    `gorm:"index;size:128" json:"resource_id"`
	TaskID      string    `gorm:"size:64" json:"task_id"`
	WaitDuration int64    `json:"wait_duration_ms"`
	QueueLength int       `json:"queue_length"`
	IsDeadlock  bool      `gorm:"default:false" json:"is_deadlock"`
}

type PredictionEvent struct {
	ID              uint           `gorm:"primaryKey" json:"id"`
	CreatedAt       time.Time      `json:"created_at"`
	PredictionID    string         `gorm:"uniqueIndex;size:64" json:"prediction_id"`
	ResourceID      string         `gorm:"size:128" json:"resource_id"`
	PredictedAt     time.Time      `json:"predicted_at"`
	RiskLevel       string         `gorm:"size:32" json:"risk_level"`
	QueueLength     int            `json:"queue_length"`
	AvgWaitTime     float64        `json:"avg_wait_time_ms"`
	TrendSlope      float64        `json:"trend_slope"`
	ActionTaken     string         `gorm:"size:128" json:"action_taken"`
	ActionResult    string         `gorm:"size:512" json:"action_result,omitempty"`
	ActualDeadlock  bool           `gorm:"default:false" json:"actual_deadlock"`
}

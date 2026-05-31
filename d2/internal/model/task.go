package model

import (
	"time"
)

type TaskStatus int

const (
	TaskStatusUnspecified TaskStatus = 0
	TaskStatusEnabled     TaskStatus = 1
	TaskStatusPaused      TaskStatus = 2
	TaskStatusDisabled    TaskStatus = 3
)

type ExecutionStatus int

const (
	ExecutionStatusUnspecified ExecutionStatus = 0
	ExecutionStatusRunning     ExecutionStatus = 1
	ExecutionStatusSuccess     ExecutionStatus = 2
	ExecutionStatusFailed      ExecutionStatus = 3
	ExecutionStatusTimeout     ExecutionStatus = 4
)

type Task struct {
	ID             int64      `gorm:"primaryKey;autoIncrement" json:"id"`
	Name           string     `gorm:"size:255;not null" json:"name"`
	Description    string     `gorm:"type:text" json:"description"`
	CronExpression string     `gorm:"size:100;not null" json:"cron_expression"`
	CallbackURL    string     `gorm:"size:500" json:"callback_url"`
	TimeoutSeconds int32      `gorm:"default:300" json:"timeout_seconds"`
	MaxRetry       int32      `gorm:"default:3" json:"max_retry"`
	Status         TaskStatus `gorm:"default:1" json:"status"`
	NextRunTime    *time.Time `json:"next_run_time"`
	CreatedAt      time.Time  `gorm:"autoCreateTime" json:"created_at"`
	UpdatedAt      time.Time  `gorm:"autoUpdateTime" json:"updated_at"`
}

type TaskExecution struct {
	ID            int64           `gorm:"primaryKey;autoIncrement" json:"id"`
	TaskID        int64           `gorm:"not null;index" json:"task_id"`
	Status        ExecutionStatus `gorm:"default:0" json:"status"`
	Result        string          `gorm:"type:text" json:"result"`
	ErrorMessage  string          `gorm:"type:text" json:"error_message"`
	RetryCount    int32           `gorm:"default:0" json:"retry_count"`
	StartTime     *time.Time      `json:"start_time"`
	EndTime       *time.Time      `json:"end_time"`
	LockKey       string          `gorm:"size:100" json:"lock_key"`
	CallbackSent  bool            `gorm:"default:false" json:"callback_sent"`
	CallbackError string          `gorm:"type:text" json:"callback_error"`
}

func (Task) TableName() string {
	return "tasks"
}

func (TaskExecution) TableName() string {
	return "task_executions"
}

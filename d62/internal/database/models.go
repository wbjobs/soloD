package database

import (
	"time"
)

type TaskStatus string

const (
	TaskStatusPending    TaskStatus = "pending"
	TaskStatusRunning    TaskStatus = "running"
	TaskStatusCompleted  TaskStatus = "completed"
	TaskStatusFailed     TaskStatus = "failed"
	TaskStatusRolledBack TaskStatus = "rolled_back"
	TaskStatusKilled     TaskStatus = "killed"
)

type Task struct {
	ID          uint       `gorm:"primaryKey" json:"id"`
	Name        string     `gorm:"not null;size:255" json:"name"`
	Priority    int        `gorm:"not null;default:0" json:"priority"`
	Status      TaskStatus `gorm:"not null;size:50" json:"status"`
	WorkerID    *string    `gorm:"size:255" json:"worker_id"`
	RetryCount  int        `gorm:"not null;default:0" json:"retry_count"`
	MaxRetries  int        `gorm:"not null;default:3" json:"max_retries"`
	StartTime   *time.Time `json:"start_time"`
	EndTime     *time.Time `json:"end_time"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`

	Dependencies []TaskDependency `gorm:"foreignKey:TaskID" json:"-"`
	ResourceLocks []ResourceLock   `gorm:"foreignKey:TaskID" json:"-"`
	WaitLocks     []ResourceLock   `gorm:"foreignKey:WaitTaskID" json:"-"`
}

type TaskDependency struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	TaskID     uint      `gorm:"not null;index" json:"task_id"`
	DependsOnID uint     `gorm:"not null;index" json:"depends_on_id"`
	CreatedAt  time.Time `json:"created_at"`

	Task      *Task `gorm:"foreignKey:TaskID" json:"-"`
	DependsOn *Task `gorm:"foreignKey:DependsOnID" json:"-"`
}

type ResourceLock struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	TaskID     uint      `gorm:"not null;index" json:"task_id"`
	WaitTaskID *uint     `gorm:"index" json:"wait_task_id"`
	Resource   string    `gorm:"not null;size:255;index" json:"resource"`
	IsHeld     bool      `gorm:"not null;default:false" json:"is_held"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`

	Task     *Task `gorm:"foreignKey:TaskID" json:"-"`
	WaitTask *Task `gorm:"foreignKey:WaitTaskID" json:"-"`
}

type DeadlockEvent struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	DetectedAt  time.Time `gorm:"not null;index" json:"detected_at"`
	CycleLength int       `gorm:"not null" json:"cycle_length"`
	TaskIDs     string    `gorm:"type:text;not null" json:"task_ids"`
	TaskNames   string    `gorm:"type:text;not null" json:"task_names"`
	SacrificeID uint      `gorm:"not null" json:"sacrifice_id"`
	SacrificeName string   `gorm:"not null;size:255" json:"sacrifice_name"`
	Reason      string    `gorm:"type:text;not null" json:"reason"`
	CreatedAt   time.Time `json:"created_at"`
}

type DeadlockEventDetail struct {
	ID         uint   `json:"id"`
	DetectedAt string `json:"detected_at"`
	CycleLength int   `json:"cycle_length"`
	TaskIDs    string `json:"task_ids"`
	TaskNames  string `json:"task_names"`
	SacrificeID uint  `json:"sacrifice_id"`
	SacrificeName string `json:"sacrifice_name"`
	Reason     string `json:"reason"`
}

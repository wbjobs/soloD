package metrics

import (
	"sync"
	"time"

	"d2/internal/model"
)

type TaskMetrics struct {
	TaskID           int64  `json:"task_id"`
	TaskName         string `json:"task_name"`
	TotalExecutions  int64  `json:"total_executions"`
	SuccessCount     int64  `json:"success_count"`
	FailureCount     int64  `json:"failure_count"`
	TimeoutCount     int64  `json:"timeout_count"`
	AvgDurationMs    int64  `json:"avg_duration_ms"`
	MinDurationMs    int64  `json:"min_duration_ms"`
	MaxDurationMs    int64  `json:"max_duration_ms"`
	LastExecutionTime *time.Time `json:"last_execution_time"`
	LastStatus       string `json:"last_status"`
}

type GlobalMetrics struct {
	TotalTasks        int            `json:"total_tasks"`
	ActiveTasks       int            `json:"active_tasks"`
	PausedTasks       int            `json:"paused_tasks"`
	TotalExecutions   int64          `json:"total_executions"`
	TodayExecutions   int64          `json:"today_executions"`
	TodaySuccess      int64          `json:"today_success"`
	TodayFailures     int64          `json:"today_failures"`
	SuccessRate       float64        `json:"success_rate"`
	AvgQueueTimeMs    int64          `json:"avg_queue_time_ms"`
	TaskMetrics       []*TaskMetrics `json:"task_metrics,omitempty"`
}

type MetricsCollector struct {
	mu              sync.RWMutex
	taskMetrics     map[int64]*TaskMetrics
	global          *GlobalMetrics
	executionBuffer []*model.TaskExecution
	bufferSize      int
}

func NewMetricsCollector(bufferSize int) *MetricsCollector {
	if bufferSize <= 0 {
		bufferSize = 1000
	}
	return &MetricsCollector{
		taskMetrics:     make(map[int64]*TaskMetrics),
		global:          &GlobalMetrics{},
		executionBuffer: make([]*model.TaskExecution, 0, bufferSize),
		bufferSize:      bufferSize,
	}
}

func (mc *MetricsCollector) RecordExecution(task *model.Task, execution *model.TaskExecution) {
	mc.mu.Lock()
	defer mc.mu.Unlock()

	durationMs := int64(0)
	if execution.StartTime != nil && execution.EndTime != nil {
		durationMs = execution.EndTime.Sub(*execution.StartTime).Milliseconds()
	}

	mc.global.TotalExecutions++

	today := time.Now().Truncate(24 * time.Hour)
	if execution.StartTime != nil && execution.StartTime.After(today) {
		mc.global.TodayExecutions++
	}

	tm, ok := mc.taskMetrics[task.ID]
	if !ok {
		tm = &TaskMetrics{
			TaskID:      task.ID,
			TaskName:    task.Name,
			MinDurationMs: durationMs,
			MaxDurationMs: durationMs,
		}
		mc.taskMetrics[task.ID] = tm
	}

	tm.TotalExecutions++
	tm.LastExecutionTime = execution.EndTime

	switch execution.Status {
	case model.ExecutionStatusSuccess:
		tm.SuccessCount++
		tm.LastStatus = "success"
		if execution.StartTime != nil && execution.StartTime.After(today) {
			mc.global.TodaySuccess++
		}
	case model.ExecutionStatusFailed:
		tm.FailureCount++
		tm.LastStatus = "failed"
		if execution.StartTime != nil && execution.StartTime.After(today) {
			mc.global.TodayFailures++
		}
	case model.ExecutionStatusTimeout:
		tm.TimeoutCount++
		tm.LastStatus = "timeout"
		if execution.StartTime != nil && execution.StartTime.After(today) {
			mc.global.TodayFailures++
		}
	}

	if durationMs > 0 {
		oldAvg := tm.AvgDurationMs
		oldCount := tm.TotalExecutions - 1
		if oldCount == 0 {
			tm.AvgDurationMs = durationMs
		} else {
			tm.AvgDurationMs = (oldAvg*oldCount + durationMs) / tm.TotalExecutions
		}

		if durationMs < tm.MinDurationMs || tm.MinDurationMs == 0 {
			tm.MinDurationMs = durationMs
		}
		if durationMs > tm.MaxDurationMs {
			tm.MaxDurationMs = durationMs
		}
	}

	mc.executionBuffer = append(mc.executionBuffer, execution)
	if len(mc.executionBuffer) > mc.bufferSize {
		mc.executionBuffer = mc.executionBuffer[1:]
	}

	mc.updateSuccessRate()
}

func (mc *MetricsCollector) updateSuccessRate() {
	total := mc.global.TodaySuccess + mc.global.TodayFailures
	if total > 0 {
		mc.global.SuccessRate = float64(mc.global.TodaySuccess) / float64(total) * 100
	}
}

func (mc *MetricsCollector) UpdateTaskStats(total, active, paused int) {
	mc.mu.Lock()
	defer mc.mu.Unlock()

	mc.global.TotalTasks = total
	mc.global.ActiveTasks = active
	mc.global.PausedTasks = paused
}

func (mc *MetricsCollector) GetGlobalMetrics() *GlobalMetrics {
	mc.mu.RLock()
	defer mc.mu.RUnlock()

	mc.updateSuccessRate()
	
	result := *mc.global
	return &result
}

func (mc *MetricsCollector) GetTaskMetrics(taskID int64) *TaskMetrics {
	mc.mu.RLock()
	defer mc.mu.RUnlock()

	tm, ok := mc.taskMetrics[taskID]
	if !ok {
		return nil
	}
	result := *tm
	return &result
}

func (mc *MetricsCollector) GetAllTaskMetrics() []*TaskMetrics {
	mc.mu.RLock()
	defer mc.mu.RUnlock()

	result := make([]*TaskMetrics, 0, len(mc.taskMetrics))
	for _, tm := range mc.taskMetrics {
		copy := *tm
		result = append(result, &copy)
	}
	return result
}

func (mc *MetricsCollector) ResetDailyStats() {
	mc.mu.Lock()
	defer mc.mu.Unlock()

	mc.global.TodayExecutions = 0
	mc.global.TodaySuccess = 0
	mc.global.TodayFailures = 0
	mc.global.SuccessRate = 0
}

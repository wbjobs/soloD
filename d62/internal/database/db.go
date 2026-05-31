package database

import (
	"deadlock-detector/config"
	"fmt"
	"strings"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var db *gorm.DB

func InitDB() error {
	var err error
	db, err = gorm.Open(postgres.Open(config.PostgresDSN), &gorm.Config{})
	if err != nil {
		return fmt.Errorf("failed to connect database: %w", err)
	}

	err = db.AutoMigrate(&Task{}, &TaskDependency{}, &ResourceLock{}, &DeadlockEvent{})
	if err != nil {
		return fmt.Errorf("failed to migrate database: %w", err)
	}

	return nil
}

func CloseDB() {
	sqlDB, err := db.DB()
	if err == nil {
		sqlDB.Close()
	}
}

func GetDB() *gorm.DB {
	return db
}

func CreateTask(task *Task) error {
	return db.Create(task).Error
}

func GetTaskByID(id uint) (*Task, error) {
	var task Task
	err := db.First(&task, id).Error
	if err != nil {
		return nil, err
	}
	return &task, nil
}

func UpdateTask(task *Task) error {
	return db.Save(task).Error
}

func GetRunningTasks() ([]Task, error) {
	var tasks []Task
	err := db.Where("status = ?", TaskStatusRunning).Find(&tasks).Error
	return tasks, err
}

func CreateTaskDependency(dep *TaskDependency) error {
	return db.Create(dep).Error
}

func CreateResourceLock(lock *ResourceLock) error {
	return db.Create(lock).Error
}

func GetAllResourceLocks() ([]ResourceLock, error) {
	var locks []ResourceLock
	err := db.Find(&locks).Error
	return locks, err
}

func GetHeldLocksByTaskID(taskID uint) ([]ResourceLock, error) {
	var locks []ResourceLock
	err := db.Where("task_id = ? AND is_held = ?", taskID, true).Find(&locks).Error
	return locks, err
}

func GetWaitingLocksByTaskID(taskID uint) ([]ResourceLock, error) {
	var locks []ResourceLock
	err := db.Where("wait_task_id = ? AND is_held = ?", taskID, false).Find(&locks).Error
	return locks, err
}

func CreateDeadlockEvent(event *DeadlockEvent) error {
	return db.Create(event).Error
}

func GetDeadlockHistory(page, pageSize int) ([]DeadlockEventDetail, int64, error) {
	var events []DeadlockEvent
	var total int64

	offset := (page - 1) * pageSize

	db.Model(&DeadlockEvent{}).Count(&total)
	err := db.Order("detected_at desc").Offset(offset).Limit(pageSize).Find(&events).Error
	if err != nil {
		return nil, 0, err
	}

	details := make([]DeadlockEventDetail, len(events))
	for i, e := range events {
		details[i] = DeadlockEventDetail{
			ID:            e.ID,
			DetectedAt:    e.DetectedAt.Format(time.RFC3339),
			CycleLength:   e.CycleLength,
			TaskIDs:       e.TaskIDs,
			TaskNames:     e.TaskNames,
			SacrificeID:   e.SacrificeID,
			SacrificeName: e.SacrificeName,
			Reason:        e.Reason,
		}
	}

	return details, total, nil
}

func GetDeadlockByID(id uint) (*DeadlockEventDetail, error) {
	var event DeadlockEvent
	err := db.First(&event, id).Error
	if err != nil {
		return nil, err
	}

	detail := &DeadlockEventDetail{
		ID:            event.ID,
		DetectedAt:    event.DetectedAt.Format(time.RFC3339),
		CycleLength:   event.CycleLength,
		TaskIDs:       event.TaskIDs,
		TaskNames:     event.TaskNames,
		SacrificeID:   event.SacrificeID,
		SacrificeName: event.SacrificeName,
		Reason:        event.Reason,
	}

	return detail, nil
}

func RollbackTask(task *Task) error {
	return db.Transaction(func(tx *gorm.DB) error {
		now := time.Now()
		task.Status = TaskStatusRolledBack
		task.EndTime = &now
		if err := tx.Save(task).Error; err != nil {
			return err
		}

		if err := tx.Where("task_id = ?", task.ID).Delete(&ResourceLock{}).Error; err != nil {
			return err
		}

		if err := tx.Where("wait_task_id = ?", task.ID).Model(&ResourceLock{}).Update("wait_task_id", nil).Error; err != nil {
			return err
		}

		return nil
	})
}

func GetTaskDependencies(taskID uint) ([]uint, error) {
	var deps []TaskDependency
	err := db.Where("task_id = ?", taskID).Find(&deps).Error
	if err != nil {
		return nil, err
	}

	depIDs := make([]uint, len(deps))
	for i, d := range deps {
		depIDs[i] = d.DependsOnID
	}
	return depIDs, nil
}

func GetRunningTaskIDs() ([]uint, error) {
	var tasks []Task
	err := db.Where("status = ?", TaskStatusRunning).Select("id").Find(&tasks).Error
	if err != nil {
		return nil, err
	}

	ids := make([]uint, len(tasks))
	for i, t := range tasks {
		ids[i] = t.ID
	}
	return ids, nil
}

func BuildWaitForGraph() (map[uint][]uint, error) {
	graph := make(map[uint][]uint)

	rows, err := db.Table("resource_locks").
		Select("task_id, wait_task_id").
		Where("is_held = ? AND wait_task_id IS NOT NULL", false).
		Rows()

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var taskID, waitTaskID uint
		if err := rows.Scan(&taskID, &waitTaskID); err != nil {
			continue
		}
		graph[waitTaskID] = append(graph[waitTaskID], taskID)
	}

	return graph, nil
}

func GetTaskWithLocks(id uint) (*Task, error) {
	var task Task
	err := db.Preload("ResourceLocks").Preload("WaitLocks").First(&task, id).Error
	if err != nil {
		return nil, err
	}
	return &task, nil
}

func GetTasksByIDs(ids []uint) ([]Task, error) {
	var tasks []Task
	err := db.Where("id IN ?", ids).Find(&tasks).Error
	return tasks, err
}

func BuildTaskDependencyGraph() (map[uint][]uint, error) {
	graph := make(map[uint][]uint)

	var deps []TaskDependency
	err := db.Find(&deps).Error
	if err != nil {
		return nil, err
	}

	for _, dep := range deps {
		graph[dep.TaskID] = append(graph[dep.TaskID], dep.DependsOnID)
	}

	return graph, nil
}

func GetDeadlockStats(startDate, endDate time.Time) (map[string]interface{}, error) {
	var totalDeadlocks int64
	var totalSacrifices int64

	db.Model(&DeadlockEvent{}).
		Where("detected_at BETWEEN ? AND ?", startDate, endDate).
		Count(&totalDeadlocks)

	totalSacrifices = totalDeadlocks

	var avgCycleLength float64
	db.Model(&DeadlockEvent{}).
		Where("detected_at BETWEEN ? AND ?", startDate, endDate).
		Select("AVG(cycle_length)").
		Scan(&avgCycleLength)

	var recentEvents []DeadlockEvent
	db.Where("detected_at BETWEEN ? AND ?", startDate, endDate).
		Order("detected_at desc").
		Limit(10).
		Find(&recentEvents)

	sacrificeReasons := make(map[string]int)
	for _, e := range recentEvents {
		parts := strings.Split(e.Reason, ";")
		if len(parts) > 0 {
			reason := strings.Split(parts[0], ":")[0]
			sacrificeReasons[reason]++
		}
	}

	return map[string]interface{}{
		"total_deadlocks":      totalDeadlocks,
		"total_sacrifices":    totalSacrifices,
		"avg_cycle_length":    avgCycleLength,
		"period_start":        startDate.Format(time.RFC3339),
		"period_end":          endDate.Format(time.RFC3339),
		"top_sacrifice_reasons": sacrificeReasons,
	}, nil
}

package repository

import (
	"time"

	"gorm.io/gorm"
	"d2/internal/model"
)

type TaskRepository interface {
	Create(task *model.Task) error
	Update(task *model.Task) error
	Delete(id int64) error
	GetByID(id int64) (*model.Task, error)
	List(page, pageSize int32) ([]*model.Task, int32, error)
	GetDueTasks(now time.Time) ([]*model.Task, error)
	UpdateNextRunTime(id int64, nextRunTime *time.Time) error
	Count() (int64, error)
	CountByStatus(status model.TaskStatus) (int64, error)
}

type ExecutionQueryFilter struct {
	TaskID    *int64
	Status    *model.ExecutionStatus
	StartTime *time.Time
	EndTime   *time.Time
}

type TaskExecutionRepository interface {
	Create(execution *model.TaskExecution) error
	Update(execution *model.TaskExecution) error
	GetByID(id int64) (*model.TaskExecution, error)
	ListByTaskID(taskID int64, page, pageSize int32) ([]*model.TaskExecution, int32, error)
	List(filter ExecutionQueryFilter, page, pageSize int32) ([]*model.TaskExecution, int32, error)
	CountByTaskIDAndStatus(taskID int64, status model.ExecutionStatus) (int64, error)
	GetStatsByTaskID(taskID int64) (*ExecutionStats, error)
}

type ExecutionStats struct {
	TotalCount   int64 `json:"total_count"`
	SuccessCount int64 `json:"success_count"`
	FailCount    int64 `json:"fail_count"`
	TimeoutCount int64 `json:"timeout_count"`
	AvgDuration  int64 `json:"avg_duration_ms"`
}

type mysqlTaskRepository struct {
	db *gorm.DB
}

func NewTaskRepository(db *gorm.DB) TaskRepository {
	return &mysqlTaskRepository{db: db}
}

func (r *mysqlTaskRepository) Create(task *model.Task) error {
	return r.db.Create(task).Error
}

func (r *mysqlTaskRepository) Update(task *model.Task) error {
	return r.db.Save(task).Error
}

func (r *mysqlTaskRepository) Delete(id int64) error {
	return r.db.Delete(&model.Task{}, id).Error
}

func (r *mysqlTaskRepository) GetByID(id int64) (*model.Task, error) {
	var task model.Task
	if err := r.db.First(&task, id).Error; err != nil {
		return nil, err
	}
	return &task, nil
}

func (r *mysqlTaskRepository) List(page, pageSize int32) ([]*model.Task, int32, error) {
	var tasks []*model.Task
	var total int64

	offset := (page - 1) * pageSize
	if offset < 0 {
		offset = 0
	}

	if err := r.db.Model(&model.Task{}).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	if err := r.db.Offset(int(offset)).Limit(int(pageSize)).Find(&tasks).Error; err != nil {
		return nil, 0, err
	}

	return tasks, int32(total), nil
}

func (r *mysqlTaskRepository) GetDueTasks(now time.Time) ([]*model.Task, error) {
	var tasks []*model.Task
	err := r.db.Where("status = ? AND next_run_time <= ?", model.TaskStatusEnabled, now).Find(&tasks).Error
	return tasks, err
}

func (r *mysqlTaskRepository) UpdateNextRunTime(id int64, nextRunTime *time.Time) error {
	return r.db.Model(&model.Task{}).Where("id = ?", id).Update("next_run_time", nextRunTime).Error
}

func (r *mysqlTaskRepository) Count() (int64, error) {
	var count int64
	err := r.db.Model(&model.Task{}).Count(&count).Error
	return count, err
}

func (r *mysqlTaskRepository) CountByStatus(status model.TaskStatus) (int64, error) {
	var count int64
	err := r.db.Model(&model.Task{}).Where("status = ?", status).Count(&count).Error
	return count, err
}

type mysqlTaskExecutionRepository struct {
	db *gorm.DB
}

func NewTaskExecutionRepository(db *gorm.DB) TaskExecutionRepository {
	return &mysqlTaskExecutionRepository{db: db}
}

func (r *mysqlTaskExecutionRepository) Create(execution *model.TaskExecution) error {
	return r.db.Create(execution).Error
}

func (r *mysqlTaskExecutionRepository) Update(execution *model.TaskExecution) error {
	return r.db.Save(execution).Error
}

func (r *mysqlTaskExecutionRepository) GetByID(id int64) (*model.TaskExecution, error) {
	var execution model.TaskExecution
	if err := r.db.First(&execution, id).Error; err != nil {
		return nil, err
	}
	return &execution, nil
}

func (r *mysqlTaskExecutionRepository) ListByTaskID(taskID int64, page, pageSize int32) ([]*model.TaskExecution, int32, error) {
	var executions []*model.TaskExecution
	var total int64

	offset := (page - 1) * pageSize
	if offset < 0 {
		offset = 0
	}

	query := r.db.Model(&model.TaskExecution{}).Where("task_id = ?", taskID)
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	if err := query.Offset(int(offset)).Limit(int(pageSize)).Order("start_time DESC").Find(&executions).Error; err != nil {
		return nil, 0, err
	}

	return executions, int32(total), nil
}

func (r *mysqlTaskExecutionRepository) List(filter ExecutionQueryFilter, page, pageSize int32) ([]*model.TaskExecution, int32, error) {
	var executions []*model.TaskExecution
	var total int64

	offset := (page - 1) * pageSize
	if offset < 0 {
		offset = 0
	}

	query := r.db.Model(&model.TaskExecution{})

	if filter.TaskID != nil {
		query = query.Where("task_id = ?", *filter.TaskID)
	}
	if filter.Status != nil {
		query = query.Where("status = ?", *filter.Status)
	}
	if filter.StartTime != nil {
		query = query.Where("start_time >= ?", *filter.StartTime)
	}
	if filter.EndTime != nil {
		query = query.Where("start_time <= ?", *filter.EndTime)
	}

	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	if err := query.Offset(int(offset)).Limit(int(pageSize)).Order("start_time DESC").Find(&executions).Error; err != nil {
		return nil, 0, err
	}

	return executions, int32(total), nil
}

func (r *mysqlTaskExecutionRepository) CountByTaskIDAndStatus(taskID int64, status model.ExecutionStatus) (int64, error) {
	var count int64
	err := r.db.Model(&model.TaskExecution{}).Where("task_id = ? AND status = ?", taskID, status).Count(&count).Error
	return count, err
}

func (r *mysqlTaskExecutionRepository) GetStatsByTaskID(taskID int64) (*ExecutionStats, error) {
	stats := &ExecutionStats{}
	
	var total int64
	if err := r.db.Model(&model.TaskExecution{}).Where("task_id = ?", taskID).Count(&total).Error; err != nil {
		return nil, err
	}
	stats.TotalCount = total

	var successCount int64
	if err := r.db.Model(&model.TaskExecution{}).Where("task_id = ? AND status = ?", taskID, model.ExecutionStatusSuccess).Count(&successCount).Error; err != nil {
		return nil, err
	}
	stats.SuccessCount = successCount

	var failCount int64
	if err := r.db.Model(&model.TaskExecution{}).Where("task_id = ? AND status = ?", taskID, model.ExecutionStatusFailed).Count(&failCount).Error; err != nil {
		return nil, err
	}
	stats.FailCount = failCount

	var timeoutCount int64
	if err := r.db.Model(&model.TaskExecution{}).Where("task_id = ? AND status = ?", taskID, model.ExecutionStatusTimeout).Count(&timeoutCount).Error; err != nil {
		return nil, err
	}
	stats.TimeoutCount = timeoutCount

	var avgDuration *float64
	err := r.db.Model(&model.TaskExecution{}).
		Where("task_id = ? AND status = ?", taskID, model.ExecutionStatusSuccess).
		Select("AVG(TIMESTAMPDIFF(MICROSECOND, start_time, end_time) / 1000)").
		Scan(&avgDuration).Error
	if err != nil {
		return nil, err
	}
	if avgDuration != nil {
		stats.AvgDuration = int64(*avgDuration)
	}

	return stats, nil
}

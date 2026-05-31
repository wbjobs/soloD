package service

import (
	"context"
	"errors"
	"time"

	"d2/internal/alert"
	"d2/internal/metrics"
	"d2/internal/model"
	"d2/internal/repository"
	"d2/internal/scheduler"
)

type TaskService struct {
	taskRepo      repository.TaskRepository
	executionRepo repository.TaskExecutionRepository
	scheduler     *scheduler.Scheduler
}

func NewTaskService(
	taskRepo repository.TaskRepository,
	executionRepo repository.TaskExecutionRepository,
	scheduler *scheduler.Scheduler,
) *TaskService {
	return &TaskService{
		taskRepo:      taskRepo,
		executionRepo: executionRepo,
		scheduler:     scheduler,
	}
}

func (s *TaskService) GetAlertManager() *alert.AlertManager {
	return s.scheduler.GetAlertManager()
}

func (s *TaskService) GetMetricsCollector() *metrics.MetricsCollector {
	return s.scheduler.GetMetricsCollector()
}

type CreateTaskRequest struct {
	Name           string
	Description    string
	CronExpression string
	CallbackURL    string
	TimeoutSeconds int32
	MaxRetry       int32
}

type UpdateTaskRequest struct {
	ID             int64
	Name           string
	Description    string
	CronExpression string
	CallbackURL    string
	TimeoutSeconds int32
	MaxRetry       int32
}

type TaskResponse struct {
	ID             int64
	Name           string
	Description    string
	CronExpression string
	CallbackURL    string
	TimeoutSeconds int32
	MaxRetry       int32
	Status         int32
	NextRunTime    *time.Time
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

type TaskExecutionResponse struct {
	ID           int64
	TaskID       int64
	Status       int32
	Result       string
	ErrorMessage string
	RetryCount   int32
	StartTime    *time.Time
	EndTime      *time.Time
}

type ExecutionQueryFilter struct {
	TaskID    *int64
	Status    *int32
	StartTime *time.Time
	EndTime   *time.Time
}

type ListResponse struct {
	Tasks      []*TaskResponse
	Total      int32
	Executions []*TaskExecutionResponse
}

type TaskStatsResponse struct {
	TotalCount    int64 `json:"total_count"`
	SuccessCount  int64 `json:"success_count"`
	FailCount     int64 `json:"fail_count"`
	TimeoutCount  int64 `json:"timeout_count"`
	AvgDurationMs int64 `json:"avg_duration_ms"`
}

func (s *TaskService) CreateTask(ctx context.Context, req *CreateTaskRequest) (*TaskResponse, error) {
	if req.Name == "" {
		return nil, errors.New("task name is required")
	}
	if req.CronExpression == "" {
		return nil, errors.New("cron expression is required")
	}

	nextRunTime, err := s.scheduler.CalculateNextRun(req.CronExpression)
	if err != nil {
		return nil, errors.New("invalid cron expression")
	}

	task := &model.Task{
		Name:           req.Name,
		Description:    req.Description,
		CronExpression: req.CronExpression,
		CallbackURL:    req.CallbackURL,
		TimeoutSeconds: req.TimeoutSeconds,
		MaxRetry:       req.MaxRetry,
		Status:         model.TaskStatusEnabled,
		NextRunTime:    nextRunTime,
	}

	if task.TimeoutSeconds <= 0 {
		task.TimeoutSeconds = 300
	}

	if err := s.taskRepo.Create(task); err != nil {
		return nil, err
	}

	return s.taskToResponse(task), nil
}

func (s *TaskService) UpdateTask(ctx context.Context, req *UpdateTaskRequest) (*TaskResponse, error) {
	task, err := s.taskRepo.GetByID(req.ID)
	if err != nil {
		return nil, errors.New("task not found")
	}

	if req.Name != "" {
		task.Name = req.Name
	}
	if req.Description != "" {
		task.Description = req.Description
	}
	if req.CronExpression != "" {
		task.CronExpression = req.CronExpression
		nextRunTime, err := s.scheduler.CalculateNextRun(req.CronExpression)
		if err != nil {
			return nil, errors.New("invalid cron expression")
		}
		task.NextRunTime = nextRunTime
	}
	if req.CallbackURL != "" {
		task.CallbackURL = req.CallbackURL
	}
	if req.TimeoutSeconds > 0 {
		task.TimeoutSeconds = req.TimeoutSeconds
	}
	if req.MaxRetry >= 0 {
		task.MaxRetry = req.MaxRetry
	}

	if err := s.taskRepo.Update(task); err != nil {
		return nil, err
	}

	return s.taskToResponse(task), nil
}

func (s *TaskService) DeleteTask(ctx context.Context, id int64) error {
	_, err := s.taskRepo.GetByID(id)
	if err != nil {
		return errors.New("task not found")
	}
	return s.taskRepo.Delete(id)
}

func (s *TaskService) GetTask(ctx context.Context, id int64) (*TaskResponse, error) {
	task, err := s.taskRepo.GetByID(id)
	if err != nil {
		return nil, errors.New("task not found")
	}
	return s.taskToResponse(task), nil
}

func (s *TaskService) ListTasks(ctx context.Context, page, pageSize int32) (*ListResponse, error) {
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 10
	}

	tasks, total, err := s.taskRepo.List(page, pageSize)
	if err != nil {
		return nil, err
	}

	taskResponses := make([]*TaskResponse, len(tasks))
	for i, task := range tasks {
		taskResponses[i] = s.taskToResponse(task)
	}

	return &ListResponse{
		Tasks: taskResponses,
		Total: total,
	}, nil
}

func (s *TaskService) TriggerTask(ctx context.Context, taskID int64) (*TaskExecutionResponse, error) {
	task, err := s.taskRepo.GetByID(taskID)
	if err != nil {
		return nil, errors.New("task not found")
	}

	execution, err := s.scheduler.TriggerTask(task)
	if err != nil {
		return nil, err
	}

	return s.executionToResponse(execution), nil
}

func (s *TaskService) PauseTask(ctx context.Context, taskID int64) (*TaskResponse, error) {
	task, err := s.taskRepo.GetByID(taskID)
	if err != nil {
		return nil, errors.New("task not found")
	}

	task.Status = model.TaskStatusPaused
	if err := s.taskRepo.Update(task); err != nil {
		return nil, err
	}

	return s.taskToResponse(task), nil
}

func (s *TaskService) ResumeTask(ctx context.Context, taskID int64) (*TaskResponse, error) {
	task, err := s.taskRepo.GetByID(taskID)
	if err != nil {
		return nil, errors.New("task not found")
	}

	task.Status = model.TaskStatusEnabled
	nextRunTime, err := s.scheduler.CalculateNextRun(task.CronExpression)
	if err != nil {
		return nil, errors.New("invalid cron expression")
	}
	task.NextRunTime = nextRunTime

	if err := s.taskRepo.Update(task); err != nil {
		return nil, err
	}

	return s.taskToResponse(task), nil
}

func (s *TaskService) GetTaskExecution(ctx context.Context, executionID int64) (*TaskExecutionResponse, error) {
	execution, err := s.executionRepo.GetByID(executionID)
	if err != nil {
		return nil, errors.New("execution not found")
	}
	return s.executionToResponse(execution), nil
}

func (s *TaskService) ListTaskExecutions(ctx context.Context, taskID int64, page, pageSize int32) (*ListResponse, error) {
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 10
	}

	executions, total, err := s.executionRepo.ListByTaskID(taskID, page, pageSize)
	if err != nil {
		return nil, err
	}

	executionResponses := make([]*TaskExecutionResponse, len(executions))
	for i, execution := range executions {
		executionResponses[i] = s.executionToResponse(execution)
	}

	return &ListResponse{
		Executions: executionResponses,
		Total:      total,
	}, nil
}

func (s *TaskService) taskToResponse(task *model.Task) *TaskResponse {
	return &TaskResponse{
		ID:             task.ID,
		Name:           task.Name,
		Description:    task.Description,
		CronExpression: task.CronExpression,
		CallbackURL:    task.CallbackURL,
		TimeoutSeconds: task.TimeoutSeconds,
		MaxRetry:       task.MaxRetry,
		Status:         int32(task.Status),
		NextRunTime:    task.NextRunTime,
		CreatedAt:      task.CreatedAt,
		UpdatedAt:      task.UpdatedAt,
	}
}

func (s *TaskService) executionToResponse(execution *model.TaskExecution) *TaskExecutionResponse {
	return &TaskExecutionResponse{
		ID:           execution.ID,
		TaskID:       execution.TaskID,
		Status:       int32(execution.Status),
		Result:       execution.Result,
		ErrorMessage: execution.ErrorMessage,
		RetryCount:   execution.RetryCount,
		StartTime:    execution.StartTime,
		EndTime:      execution.EndTime,
	}
}

func (s *TaskService) ListTaskExecutionsWithFilter(ctx context.Context, filter ExecutionQueryFilter, page, pageSize int32) (*ListResponse, error) {
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 10
	}

	repoFilter := repository.ExecutionQueryFilter{}
	if filter.TaskID != nil {
		repoFilter.TaskID = filter.TaskID
	}
	if filter.Status != nil {
		status := model.ExecutionStatus(*filter.Status)
		repoFilter.Status = &status
	}
	if filter.StartTime != nil {
		repoFilter.StartTime = filter.StartTime
	}
	if filter.EndTime != nil {
		repoFilter.EndTime = filter.EndTime
	}

	executions, total, err := s.executionRepo.List(repoFilter, page, pageSize)
	if err != nil {
		return nil, err
	}

	executionResponses := make([]*TaskExecutionResponse, len(executions))
	for i, execution := range executions {
		executionResponses[i] = s.executionToResponse(execution)
	}

	return &ListResponse{
		Executions: executionResponses,
		Total:      total,
	}, nil
}

func (s *TaskService) GetTaskStats(ctx context.Context, taskID int64) (*TaskStatsResponse, error) {
	stats, err := s.executionRepo.GetStatsByTaskID(taskID)
	if err != nil {
		return nil, err
	}
	return &TaskStatsResponse{
		TotalCount:    stats.TotalCount,
		SuccessCount:  stats.SuccessCount,
		FailCount:     stats.FailCount,
		TimeoutCount:  stats.TimeoutCount,
		AvgDurationMs: stats.AvgDuration,
	}, nil
}

func (s *TaskService) GetGlobalMetrics(ctx context.Context) *metrics.GlobalMetrics {
	return s.scheduler.GetMetricsCollector().GetGlobalMetrics()
}

func (s *TaskService) GetTaskMetrics(ctx context.Context, taskID int64) *metrics.TaskMetrics {
	return s.scheduler.GetMetricsCollector().GetTaskMetrics(taskID)
}

func (s *TaskService) GetAllTaskMetrics(ctx context.Context) []*metrics.TaskMetrics {
	return s.scheduler.GetMetricsCollector().GetAllTaskMetrics()
}

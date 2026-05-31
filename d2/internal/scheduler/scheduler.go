package scheduler

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/robfig/cron/v3"
	"d2/internal/alert"
	"d2/internal/callback"
	"d2/internal/lock"
	"d2/internal/metrics"
	"d2/internal/model"
	"d2/internal/repository"
)

type TaskExecutor func(task *model.Task) (string, error)

type Scheduler struct {
	taskRepo         repository.TaskRepository
	executionRepo    repository.TaskExecutionRepository
	lock             lock.DistributedLock
	notifier         callback.Notifier
	alertManager     *alert.AlertManager
	metricsCollector *metrics.MetricsCollector
	cron             *cron.Cron
	ticker           *time.Ticker
	stopChan         chan struct{}
	workerCount      int
	taskQueue        chan *model.Task
	wg               sync.WaitGroup
	taskExecutor     TaskExecutor
}

func NewScheduler(
	taskRepo repository.TaskRepository,
	executionRepo repository.TaskExecutionRepository,
	lock lock.DistributedLock,
	notifier callback.Notifier,
	workerCount int,
) *Scheduler {
	if workerCount <= 0 {
		workerCount = 5
	}

	return &Scheduler{
		taskRepo:      taskRepo,
		executionRepo: executionRepo,
		lock:          lock,
		notifier:      notifier,
		alertManager:     alert.NewAlertManager(),
		metricsCollector: metrics.NewMetricsCollector(1000),
		cron:          cron.New(cron.WithSeconds()),
		ticker:        time.NewTicker(5 * time.Second),
		stopChan:      make(chan struct{}),
		workerCount:   workerCount,
		taskQueue:     make(chan *model.Task, 100),
		taskExecutor:  defaultTaskExecutor,
	}
}

func (s *Scheduler) GetAlertManager() *alert.AlertManager {
	return s.alertManager
}

func (s *Scheduler) GetMetricsCollector() *metrics.MetricsCollector {
	return s.metricsCollector
}

func (s *Scheduler) SetTaskExecutor(executor TaskExecutor) {
	s.taskExecutor = executor
}

var defaultTaskExecutor = func(task *model.Task) (string, error) {
	log.Printf("Executing task: %s (ID: %d)", task.Name, task.ID)
	time.Sleep(100 * time.Millisecond)
	return fmt.Sprintf("Task %d executed successfully at %s", task.ID, time.Now().Format(time.RFC3339)), nil
}

func (s *Scheduler) Start() error {
	log.Println("Starting scheduler...")

	for i := 0; i < s.workerCount; i++ {
		s.wg.Add(1)
		go s.worker(i)
	}

	s.wg.Add(1)
	go s.scheduleLoop()

	s.cron.Start()
	log.Println("Scheduler started successfully")
	return nil
}

func (s *Scheduler) Stop() {
	log.Println("Stopping scheduler...")
	s.ticker.Stop()
	close(s.stopChan)
	s.cron.Stop()
	s.wg.Wait()
	close(s.taskQueue)
	log.Println("Scheduler stopped")
}

func (s *Scheduler) scheduleLoop() {
	defer s.wg.Done()

	for {
		select {
		case <-s.stopChan:
			return
		case <-s.ticker.C:
			s.checkDueTasks()
		}
	}
}

func (s *Scheduler) checkDueTasks() {
	now := time.Now()
	tasks, err := s.taskRepo.GetDueTasks(now)
	if err != nil {
		log.Printf("Failed to get due tasks: %v", err)
		return
	}

	for _, task := range tasks {
		select {
		case s.taskQueue <- task:
		default:
			log.Printf("Task queue is full, dropping task %d", task.ID)
		}
	}
}

func (s *Scheduler) worker(id int) {
	defer s.wg.Done()
	log.Printf("Worker %d started", id)

	for task := range s.taskQueue {
		s.executeTask(task)
	}

	log.Printf("Worker %d stopped", id)
}

func (s *Scheduler) executeTask(task *model.Task) {
	ctx := context.Background()
	lockKey := fmt.Sprintf("task_%d", task.ID)

	ttl := time.Duration(task.TimeoutSeconds) * time.Second
	token, acquired, err := s.lock.Lock(ctx, lockKey, ttl)
	if err != nil {
		log.Printf("Failed to acquire lock for task %d: %v", task.ID, err)
		return
	}
	if !acquired {
		log.Printf("Task %d is already being executed by another instance", task.ID)
		return
	}
	defer s.lock.Unlock(ctx, lockKey, token)

	s.scheduleNextRun(task)

	now := time.Now()
	execution := &model.TaskExecution{
		TaskID:    task.ID,
		Status:    model.ExecutionStatusRunning,
		StartTime: &now,
		LockKey:   lockKey,
	}

	if err := s.executionRepo.Create(execution); err != nil {
		log.Printf("Failed to create execution for task %d: %v", task.ID, err)
		return
	}

	if task.CallbackURL != "" {
		go func() {
			if err := s.notifier.Notify(task.CallbackURL, execution); err != nil {
				log.Printf("Failed to send start callback for execution %d: %v", execution.ID, err)
			}
		}()
	}

	result, err := s.runTaskWithRetry(task, execution)

	endTime := time.Now()
	execution.EndTime = &endTime

	if err != nil {
		execution.Status = model.ExecutionStatusFailed
		execution.ErrorMessage = err.Error()
		log.Printf("Task %d execution failed after %d retries: %v", task.ID, execution.RetryCount, err)
	} else {
		execution.Status = model.ExecutionStatusSuccess
		execution.Result = result
		log.Printf("Task %d execution succeeded after %d retries", task.ID, execution.RetryCount)
	}

	if err := s.executionRepo.Update(execution); err != nil {
		log.Printf("Failed to update execution %d: %v", execution.ID, err)
	}

	if s.metricsCollector != nil {
		s.metricsCollector.RecordExecution(task, execution)
	}

	if execution.Status == model.ExecutionStatusFailed && s.alertManager != nil {
		go s.alertManager.AlertFailure(task, execution)
	}

	if task.CallbackURL != "" {
		go func() {
			if err := s.notifier.Notify(task.CallbackURL, execution); err != nil {
				log.Printf("Failed to send completion callback for execution %d: %v", execution.ID, err)
				execution.CallbackError = err.Error()
				s.executionRepo.Update(execution)
			} else {
				execution.CallbackSent = true
				s.executionRepo.Update(execution)
			}
		}()
	}
}

func (s *Scheduler) runTaskWithRetry(task *model.Task, execution *model.TaskExecution) (string, error) {
	var lastErr error
	for i := int32(0); i <= task.MaxRetry; i++ {
		execution.RetryCount = i
		if i > 0 {
			log.Printf("Retrying task %d, attempt %d/%d", task.ID, i, task.MaxRetry)
		}

		result, err := s.runTask(task)
		if err == nil {
			return result, nil
		}

		lastErr = err
		log.Printf("Task %d attempt %d failed: %v", task.ID, i, err)
		
		if i < task.MaxRetry {
			retryDelay := time.Second * time.Duration(1<<i)
			time.Sleep(retryDelay)
		}
	}

	return "", fmt.Errorf("task failed after %d retries: %w", task.MaxRetry, lastErr)
}

func (s *Scheduler) runTask(task *model.Task) (string, error) {
	return s.taskExecutor(task)
}

func (s *Scheduler) scheduleNextRun(task *model.Task) {
	sched, err := cron.ParseStandard(task.CronExpression)
	if err != nil {
		log.Printf("Failed to parse cron expression for task %d: %v", task.ID, err)
		return
	}

	nextRun := sched.Next(time.Now())
	if err := s.taskRepo.UpdateNextRunTime(task.ID, &nextRun); err != nil {
		log.Printf("Failed to update next run time for task %d: %v", task.ID, err)
	}
}

func (s *Scheduler) CalculateNextRun(cronExpr string) (*time.Time, error) {
	sched, err := cron.ParseStandard(cronExpr)
	if err != nil {
		return nil, err
	}
	next := sched.Next(time.Now())
	return &next, nil
}

func (s *Scheduler) TriggerTask(task *model.Task) (*model.TaskExecution, error) {
	ctx := context.Background()
	lockKey := fmt.Sprintf("task_%d_manual", task.ID)

	ttl := time.Duration(task.TimeoutSeconds) * time.Second
	token, acquired, err := s.lock.Lock(ctx, lockKey, ttl)
	if err != nil {
		return nil, fmt.Errorf("failed to acquire lock: %w", err)
	}
	if !acquired {
		return nil, fmt.Errorf("task is already being executed")
	}
	defer s.lock.Unlock(ctx, lockKey, token)

	now := time.Now()
	execution := &model.TaskExecution{
		TaskID:    task.ID,
		Status:    model.ExecutionStatusRunning,
		StartTime: &now,
		LockKey:   lockKey,
	}

	if err := s.executionRepo.Create(execution); err != nil {
		return nil, fmt.Errorf("failed to create execution: %w", err)
	}

	if task.CallbackURL != "" {
		go func() {
			s.notifier.Notify(task.CallbackURL, execution)
		}()
	}

	result, err := s.runTaskWithRetry(task, execution)

	endTime := time.Now()
	execution.EndTime = &endTime

	if err != nil {
		execution.Status = model.ExecutionStatusFailed
		execution.ErrorMessage = err.Error()
	} else {
		execution.Status = model.ExecutionStatusSuccess
		execution.Result = result
	}

	if err := s.executionRepo.Update(execution); err != nil {
		return nil, fmt.Errorf("failed to update execution: %w", err)
	}

	if s.metricsCollector != nil {
		s.metricsCollector.RecordExecution(task, execution)
	}

	if execution.Status == model.ExecutionStatusFailed && s.alertManager != nil {
		go s.alertManager.AlertFailure(task, execution)
	}

	if task.CallbackURL != "" {
		go func() {
			s.notifier.Notify(task.CallbackURL, execution)
		}()
	}

	return execution, nil
}

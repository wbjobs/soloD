package api

import (
	"deadlock-detector/internal/database"
	"deadlock-detector/internal/detector"
	"deadlock-detector/internal/scheduler"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

type CreateTaskRequest struct {
	Name        string `json:"name" binding:"required"`
	Priority    int    `json:"priority"`
	MaxRetries  int    `json:"max_retries"`
	WorkerID    string `json:"worker_id"`
}

type CreateDependencyRequest struct {
	TaskID     uint `json:"task_id" binding:"required"`
	DependsOnID uint `json:"depends_on_id" binding:"required"`
}

type CreateResourceLockRequest struct {
	TaskID     uint   `json:"task_id" binding:"required"`
	Resource   string `json:"resource" binding:"required"`
	IsHeld     bool   `json:"is_held"`
	WaitTaskID *uint  `json:"wait_task_id"`
}

func SetupRouter() *gin.Engine {
	router := gin.Default()

	api := router.Group("/api/v1")
	{
		tasks := api.Group("/tasks")
		{
			tasks.POST("", CreateTask)
			tasks.GET("", GetTasks)
			tasks.GET("/:id", GetTaskByID)
			tasks.PUT("/:id", UpdateTask)
			tasks.POST("/:id/start", StartTask)
			tasks.POST("/:id/complete", CompleteTask)
			tasks.POST("/:id/fail", FailTask)
		}

		deps := api.Group("/dependencies")
		{
			deps.POST("", CreateDependency)
		}

		locks := api.Group("/locks")
		{
			locks.POST("", CreateResourceLock)
			locks.GET("", GetResourceLocks)
		}

		deadlock := api.Group("/deadlock")
		{
			deadlock.GET("/history", GetDeadlockHistory)
			deadlock.GET("/history/:id", GetDeadlockByID)
			deadlock.POST("/detect", RunManualDetection)
			deadlock.GET("/stats", GetDeadlockStats)
		}

		schedulerGroup := api.Group("/scheduler")
		{
			schedulerGroup.GET("/status", GetSchedulerStatus)
		}
	}

	return router
}

func CreateTask(c *gin.Context) {
	var req CreateTaskRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.MaxRetries == 0 {
		req.MaxRetries = 3
	}

	task := &database.Task{
		Name:       req.Name,
		Priority:   req.Priority,
		Status:     database.TaskStatusPending,
		WorkerID:   &req.WorkerID,
		MaxRetries: req.MaxRetries,
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
	}

	if err := database.CreateTask(task); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create task"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Task created successfully",
		"task":    task,
	})
}

func GetTasks(c *gin.Context) {
	status := c.Query("status")
	
	var tasks []database.Task
	var err error

	if status != "" {
		c.JSON(http.StatusOK, gin.H{"message": "Filter by status not implemented yet"})
		return
	}

	tasks, err = database.GetRunningTasks()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get tasks"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"tasks": tasks,
		"count": len(tasks),
	})
}

func GetTaskByID(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid task ID"})
		return
	}

	task, err := database.GetTaskByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Task not found"})
		return
	}

	taskWithLocks, err := database.GetTaskWithLocks(uint(id))
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"task": task})
		return
	}

	c.JSON(http.StatusOK, gin.H{"task": taskWithLocks})
}

func UpdateTask(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"message": "Update task"})
}

func StartTask(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid task ID"})
		return
	}

	task, err := database.GetTaskByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Task not found"})
		return
	}

	now := time.Now()
	task.Status = database.TaskStatusRunning
	task.StartTime = &now
	task.UpdatedAt = now

	if err := database.UpdateTask(task); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start task"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Task started",
		"task":    task,
	})
}

func CompleteTask(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid task ID"})
		return
	}

	task, err := database.GetTaskByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Task not found"})
		return
	}

	now := time.Now()
	task.Status = database.TaskStatusCompleted
	task.EndTime = &now
	task.UpdatedAt = now

	if err := database.UpdateTask(task); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to complete task"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Task completed",
		"task":    task,
	})
}

func FailTask(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid task ID"})
		return
	}

	task, err := database.GetTaskByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Task not found"})
		return
	}

	now := time.Now()
	task.Status = database.TaskStatusFailed
	task.EndTime = &now
	task.UpdatedAt = now

	if err := database.UpdateTask(task); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fail task"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Task failed",
		"task":    task,
	})
}

func CreateDependency(c *gin.Context) {
	var req CreateDependencyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	dep := &database.TaskDependency{
		TaskID:      req.TaskID,
		DependsOnID: req.DependsOnID,
		CreatedAt:   time.Now(),
	}

	if err := database.CreateTaskDependency(dep); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create dependency"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message":    "Dependency created successfully",
		"dependency": dep,
	})
}

func CreateResourceLock(c *gin.Context) {
	var req CreateResourceLockRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	lock := &database.ResourceLock{
		TaskID:     req.TaskID,
		WaitTaskID: req.WaitTaskID,
		Resource:   req.Resource,
		IsHeld:     req.IsHeld,
		CreatedAt:  time.Now(),
		UpdatedAt:  time.Now(),
	}

	if err := database.CreateResourceLock(lock); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create resource lock"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Resource lock created successfully",
		"lock":    lock,
	})
}

func GetResourceLocks(c *gin.Context) {
	locks, err := database.GetAllResourceLocks()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get resource locks"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"locks": locks,
		"count": len(locks),
	})
}

func GetDeadlockHistory(c *gin.Context) {
	page := 1
	pageSize := 20

	if pageStr := c.Query("page"); pageStr != "" {
		if p, err := strconv.Atoi(pageStr); err == nil && p > 0 {
			page = p
		}
	}

	if sizeStr := c.Query("page_size"); sizeStr != "" {
		if s, err := strconv.Atoi(sizeStr); err == nil && s > 0 {
			pageSize = s
		}
	}

	events, total, err := database.GetDeadlockHistory(page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get deadlock history"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"events":    events,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
		"pages":     (int(total) + pageSize - 1) / pageSize,
	})
}

func GetDeadlockByID(c *gin.Context) {
	idParam := c.Param("id")
	id, err := strconv.ParseUint(idParam, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid deadlock event ID"})
		return
	}

	event, err := database.GetDeadlockByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Deadlock event not found"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"event": event})
}

func RunManualDetection(c *gin.Context) {
	detectorInstance := detector.NewDeadlockDetector()
	
	cycles, err := detectorInstance.RunDetection()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":          "Detection completed",
		"deadlocks_found":  cycles,
		"status":           "success",
	})
}

func GetDeadlockStats(c *gin.Context) {
	endDate := time.Now()
	startDate := endDate.AddDate(0, 0, -7)

	if startStr := c.Query("start_date"); startStr != "" {
		if t, err := time.Parse(time.RFC3339, startStr); err == nil {
			startDate = t
		}
	}

	if endStr := c.Query("end_date"); endStr != "" {
		if t, err := time.Parse(time.RFC3339, endStr); err == nil {
			endDate = t
		}
	}

	stats, err := database.GetDeadlockStats(startDate, endDate)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get deadlock stats"})
		return
	}

	c.JSON(http.StatusOK, stats)
}

func GetSchedulerStatus(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"running": scheduler.IsRunning(),
		"interval": "30 seconds",
	})
}

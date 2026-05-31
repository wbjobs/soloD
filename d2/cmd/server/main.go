package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gorilla/mux"
	"github.com/redis/go-redis/v9"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"

	"d2/configs"
	"d2/internal/callback"
	"d2/internal/lock"
	"d2/internal/model"
	"d2/internal/repository"
	"d2/internal/scheduler"
	"d2/internal/service"
)

type Server struct {
	config      *configs.Config
	taskService *service.TaskService
	scheduler   *scheduler.Scheduler
	httpServer  *http.Server
}

func main() {
	cfg := configs.NewDefaultConfig()

	server, err := NewServer(cfg)
	if err != nil {
		log.Fatalf("Failed to create server: %v", err)
	}

	go func() {
		if err := server.Start(); err != nil {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")
	server.Stop()
	log.Println("Server stopped")
}

func NewServer(cfg *configs.Config) (*Server, error) {
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=utf8mb4&parseTime=True&loc=Local",
		cfg.MySQL.User, cfg.MySQL.Password, cfg.MySQL.Host, cfg.MySQL.Port, cfg.MySQL.DBName)

	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{})
	if err != nil {
		return nil, fmt.Errorf("failed to connect to mysql: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("failed to get sql db: %w", err)
	}
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetMaxOpenConns(100)

	if err := db.AutoMigrate(&model.Task{}, &model.TaskExecution{}); err != nil {
		return nil, fmt.Errorf("failed to migrate: %w", err)
	}
	log.Println("MySQL migrated successfully")

	redisClient := redis.NewClient(&redis.Options{
		Addr:     cfg.Redis.Addr,
		Password: cfg.Redis.Password,
		DB:       cfg.Redis.DB,
	})

	if err := redisClient.Ping(context.Background()).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to redis: %w", err)
	}
	log.Println("Redis connected successfully")

	taskRepo := repository.NewTaskRepository(db)
	executionRepo := repository.NewTaskExecutionRepository(db)
	distLock := lock.NewRedisLock(redisClient)
	notifier := callback.NewHTTPNotifier()

	sched := scheduler.NewScheduler(taskRepo, executionRepo, distLock, notifier, cfg.Scheduler.WorkerCount)
	taskService := service.NewTaskService(taskRepo, executionRepo, sched)

	alertMgr := taskService.GetAlertManager()
	if cfg.Email.Enabled {
		emailAlert := alert.NewEmailAlert(alert.EmailConfig{
			Host:     cfg.Email.Host,
			Port:     cfg.Email.Port,
			Username: cfg.Email.Username,
			Password: cfg.Email.Password,
			From:     cfg.Email.From,
			To:       cfg.Email.To,
		})
		alertMgr.AddChannel(emailAlert)
	}
	if cfg.Webhook.Enabled {
		webhookAlert := alert.NewWebhookAlert(alert.WebhookConfig{
			URL:     cfg.Webhook.URL,
			Headers: cfg.Webhook.Headers,
		})
		alertMgr.AddChannel(webhookAlert)
	}

	return &Server{
		config:      cfg,
		taskService: taskService,
		scheduler:   sched,
	}, nil
}

func (s *Server) Start() error {
	if err := s.scheduler.Start(); err != nil {
		return fmt.Errorf("failed to start scheduler: %w", err)
	}

	router := mux.NewRouter()

	router.HandleFunc("/api/tasks", s.createTaskHandler).Methods("POST")
	router.HandleFunc("/api/tasks", s.listTasksHandler).Methods("GET")
	router.HandleFunc("/api/tasks/{id}", s.getTaskHandler).Methods("GET")
	router.HandleFunc("/api/tasks/{id}", s.updateTaskHandler).Methods("PUT")
	router.HandleFunc("/api/tasks/{id}", s.deleteTaskHandler).Methods("DELETE")
	router.HandleFunc("/api/tasks/{id}/trigger", s.triggerTaskHandler).Methods("POST")
	router.HandleFunc("/api/tasks/{id}/pause", s.pauseTaskHandler).Methods("POST")
	router.HandleFunc("/api/tasks/{id}/resume", s.resumeTaskHandler).Methods("POST")
	router.HandleFunc("/api/tasks/{id}/executions", s.listTaskExecutionsHandler).Methods("GET")
	router.HandleFunc("/api/tasks/{id}/stats", s.getTaskStatsHandler).Methods("GET")
	router.HandleFunc("/api/tasks/{id}/metrics", s.getTaskMetricsHandler).Methods("GET")
	router.HandleFunc("/api/executions/{id}", s.getTaskExecutionHandler).Methods("GET")
	router.HandleFunc("/api/metrics", s.getGlobalMetricsHandler).Methods("GET")
	router.HandleFunc("/api/metrics/tasks", s.listAllTaskMetricsHandler).Methods("GET")

	router.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	s.httpServer = &http.Server{
		Addr:    s.config.Server.HTTPPort,
		Handler: router,
	}

	log.Printf("HTTP server starting on %s", s.config.Server.HTTPPort)
	if err := s.httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("failed to start http server: %w", err)
	}

	return nil
}

func (s *Server) Stop() {
	if s.httpServer != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		s.httpServer.Shutdown(ctx)
	}

	s.scheduler.Stop()
}

type CreateTaskRequest struct {
	Name           string `json:"name"`
	Description    string `json:"description"`
	CronExpression string `json:"cron_expression"`
	CallbackURL    string `json:"callback_url"`
	TimeoutSeconds int32  `json:"timeout_seconds"`
	MaxRetry       int32  `json:"max_retry"`
}

type UpdateTaskRequest struct {
	Name           string `json:"name"`
	Description    string `json:"description"`
	CronExpression string `json:"cron_expression"`
	CallbackURL    string `json:"callback_url"`
	TimeoutSeconds int32  `json:"timeout_seconds"`
	MaxRetry       int32  `json:"max_retry"`
}

type Response struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

func (s *Server) createTaskHandler(w http.ResponseWriter, r *http.Request) {
	var req CreateTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, err.Error(), http.StatusBadRequest)
		return
	}

	task, err := s.taskService.CreateTask(r.Context(), &service.CreateTaskRequest{
		Name:           req.Name,
		Description:    req.Description,
		CronExpression: req.CronExpression,
		CallbackURL:    req.CallbackURL,
		TimeoutSeconds: req.TimeoutSeconds,
		MaxRetry:       req.MaxRetry,
	})
	if err != nil {
		sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	sendSuccess(w, task)
}

func (s *Server) listTasksHandler(w http.ResponseWriter, r *http.Request) {
	page := parseInt(r.URL.Query().Get("page"), 1)
	pageSize := parseInt(r.URL.Query().Get("page_size"), 10)

	result, err := s.taskService.ListTasks(r.Context(), page, pageSize)
	if err != nil {
		sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	sendSuccess(w, result)
}

func (s *Server) getTaskHandler(w http.ResponseWriter, r *http.Request) {
	id := parseID(mux.Vars(r)["id"])
	if id == 0 {
		sendError(w, "invalid task id", http.StatusBadRequest)
		return
	}

	task, err := s.taskService.GetTask(r.Context(), id)
	if err != nil {
		sendError(w, err.Error(), http.StatusNotFound)
		return
	}

	sendSuccess(w, task)
}

func (s *Server) updateTaskHandler(w http.ResponseWriter, r *http.Request) {
	id := parseID(mux.Vars(r)["id"])
	if id == 0 {
		sendError(w, "invalid task id", http.StatusBadRequest)
		return
	}

	var req UpdateTaskRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, err.Error(), http.StatusBadRequest)
		return
	}

	task, err := s.taskService.UpdateTask(r.Context(), &service.UpdateTaskRequest{
		ID:             id,
		Name:           req.Name,
		Description:    req.Description,
		CronExpression: req.CronExpression,
		CallbackURL:    req.CallbackURL,
		TimeoutSeconds: req.TimeoutSeconds,
		MaxRetry:       req.MaxRetry,
	})
	if err != nil {
		sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	sendSuccess(w, task)
}

func (s *Server) deleteTaskHandler(w http.ResponseWriter, r *http.Request) {
	id := parseID(mux.Vars(r)["id"])
	if id == 0 {
		sendError(w, "invalid task id", http.StatusBadRequest)
		return
	}

	if err := s.taskService.DeleteTask(r.Context(), id); err != nil {
		sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	sendSuccess(w, nil)
}

func (s *Server) triggerTaskHandler(w http.ResponseWriter, r *http.Request) {
	id := parseID(mux.Vars(r)["id"])
	if id == 0 {
		sendError(w, "invalid task id", http.StatusBadRequest)
		return
	}

	execution, err := s.taskService.TriggerTask(r.Context(), id)
	if err != nil {
		sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	sendSuccess(w, execution)
}

func (s *Server) pauseTaskHandler(w http.ResponseWriter, r *http.Request) {
	id := parseID(mux.Vars(r)["id"])
	if id == 0 {
		sendError(w, "invalid task id", http.StatusBadRequest)
		return
	}

	task, err := s.taskService.PauseTask(r.Context(), id)
	if err != nil {
		sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	sendSuccess(w, task)
}

func (s *Server) resumeTaskHandler(w http.ResponseWriter, r *http.Request) {
	id := parseID(mux.Vars(r)["id"])
	if id == 0 {
		sendError(w, "invalid task id", http.StatusBadRequest)
		return
	}

	task, err := s.taskService.ResumeTask(r.Context(), id)
	if err != nil {
		sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	sendSuccess(w, task)
}

func (s *Server) listTaskExecutionsHandler(w http.ResponseWriter, r *http.Request) {
	taskID := parseID(mux.Vars(r)["id"])
	if taskID == 0 {
		sendError(w, "invalid task id", http.StatusBadRequest)
		return
	}

	page := parseInt(r.URL.Query().Get("page"), 1)
	pageSize := parseInt(r.URL.Query().Get("page_size"), 10)
	status := parseInt(r.URL.Query().Get("status"), 0)

	filter := service.ExecutionQueryFilter{
		TaskID: &taskID,
	}
	if status > 0 {
		filter.Status = &status
	}

	result, err := s.taskService.ListTaskExecutionsWithFilter(r.Context(), filter, page, pageSize)
	if err != nil {
		sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	sendSuccess(w, result)
}

func (s *Server) getTaskStatsHandler(w http.ResponseWriter, r *http.Request) {
	taskID := parseID(mux.Vars(r)["id"])
	if taskID == 0 {
		sendError(w, "invalid task id", http.StatusBadRequest)
		return
	}

	stats, err := s.taskService.GetTaskStats(r.Context(), taskID)
	if err != nil {
		sendError(w, err.Error(), http.StatusInternalServerError)
		return
	}

	sendSuccess(w, stats)
}

func (s *Server) getGlobalMetricsHandler(w http.ResponseWriter, r *http.Request) {
	metrics := s.taskService.GetGlobalMetrics(r.Context())
	sendSuccess(w, metrics)
}

func (s *Server) getTaskMetricsHandler(w http.ResponseWriter, r *http.Request) {
	taskID := parseID(mux.Vars(r)["id"])
	if taskID == 0 {
		sendError(w, "invalid task id", http.StatusBadRequest)
		return
	}

	metrics := s.taskService.GetTaskMetrics(r.Context(), taskID)
	if metrics == nil {
		sendError(w, "metrics not found", http.StatusNotFound)
		return
	}

	sendSuccess(w, metrics)
}

func (s *Server) listAllTaskMetricsHandler(w http.ResponseWriter, r *http.Request) {
	metrics := s.taskService.GetAllTaskMetrics(r.Context())
	sendSuccess(w, metrics)
}

func (s *Server) getTaskExecutionHandler(w http.ResponseWriter, r *http.Request) {
	id := parseID(mux.Vars(r)["id"])
	if id == 0 {
		sendError(w, "invalid execution id", http.StatusBadRequest)
		return
	}

	execution, err := s.taskService.GetTaskExecution(r.Context(), id)
	if err != nil {
		sendError(w, err.Error(), http.StatusNotFound)
		return
	}

	sendSuccess(w, execution)
}

func sendSuccess(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(Response{
		Success: true,
		Data:    data,
	})
}

func sendError(w http.ResponseWriter, err string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(Response{
		Success: false,
		Error:   err,
	})
}

func parseID(s string) int64 {
	var id int64
	fmt.Sscanf(s, "%d", &id)
	return id
}

func parseInt(s string, defaultValue int32) int32 {
	if s == "" {
		return defaultValue
	}
	var val int
	fmt.Sscanf(s, "%d", &val)
	return int32(val)
}

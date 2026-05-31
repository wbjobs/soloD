package handlers

import (
	"deadlock-detector/config"
	"deadlock-detector/detector"
	"deadlock-detector/models"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
)

type APIHandler struct {
	detector *detector.DeadlockDetector
}

func NewAPIHandler(d *detector.DeadlockDetector) *APIHandler {
	return &APIHandler{detector: d}
}

func (h *APIHandler) GetDeadlockHistory(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	offset := (page - 1) * pageSize

	var audits []models.DeadlockAudit
	var total int64

	if err := config.DB.Model(&models.DeadlockAudit{}).Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to count deadlock history",
		})
		return
	}

	if err := config.DB.Order("detected_at DESC").Offset(offset).Limit(pageSize).Find(&audits).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch deadlock history",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":       audits,
		"total":      total,
		"page":       page,
		"page_size":  pageSize,
		"total_pages": (total + int64(pageSize) - 1) / int64(pageSize),
	})
}

func (h *APIHandler) GetDeadlockByID(c *gin.Context) {
	id := c.Param("id")

	var audit models.DeadlockAudit
	if err := config.DB.Where("deadlock_id = ?", id).First(&audit).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{
			"error": "Deadlock record not found",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": audit,
	})
}

func (h *APIHandler) TriggerDetection(c *gin.Context) {
	go h.detector.RunDetection()

	c.JSON(http.StatusAccepted, gin.H{
		"message": "Deadlock detection triggered",
	})
}

func (h *APIHandler) GetTasks(c *gin.Context) {
	status := c.Query("status")

	var tasks []models.Task
	query := config.DB.Order("created_at DESC")

	if status != "" {
		query = query.Where("status = ?", status)
	}

	if err := query.Limit(100).Find(&tasks).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch tasks",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": tasks,
	})
}

func (h *APIHandler) CreateTask(c *gin.Context) {
	var req struct {
		TaskID       string   `json:"task_id" binding:"required"`
		Name         string   `json:"name" binding:"required"`
		Priority     int      `json:"priority"`
		DependsOn    []string `json:"depends_on"`
		ResourceSize int64    `json:"resource_size"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	task := models.Task{
		TaskID:       req.TaskID,
		Name:         req.Name,
		Status:       models.TaskStatusPending,
		Priority:     req.Priority,
		ResourceSize: req.ResourceSize,
		MaxRetries:   3,
	}

	tx := config.DB.Begin()
	if err := tx.Create(&task).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create task",
		})
		return
	}

	for _, dep := range req.DependsOn {
		dependency := models.TaskDependency{
			TaskID:    req.TaskID,
			DependsOn: dep,
		}
		if err := tx.Create(&dependency).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to create task dependency",
			})
			return
		}
	}

	tx.Commit()

	taskMap := map[string]interface{}{
		"task_id":       req.TaskID,
		"name":          req.Name,
		"priority":      req.Priority,
		"resource_size": req.ResourceSize,
		"timestamp":     time.Now().Unix(),
	}

	_, err := config.RedisClient.XAdd(config.Ctx, &redis.XAddArgs{
		Stream: config.TaskStream,
		Values: taskMap,
	}).Result()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Task created but failed to enqueue",
			"task_id": req.TaskID,
		})
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"message": "Task created and enqueued",
		"task_id": req.TaskID,
	})
}

func (h *APIHandler) GetTaskDependencies(c *gin.Context) {
	taskID := c.Param("task_id")

	var dependencies []models.TaskDependency
	if err := config.DB.Where("task_id = ?", taskID).Find(&dependencies).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch task dependencies",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data": dependencies,
	})
}

func (h *APIHandler) GetLockStatus(c *gin.Context) {
	var lockedResources []models.LockResource
	if err := config.DB.Where("is_locked = ?", true).Find(&lockedResources).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch locked resources",
		})
		return
	}

	var waitingLocks []models.WaitForLock
	if err := config.DB.Find(&waitingLocks).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch waiting locks",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"held_locks":   lockedResources,
		"waiting_locks": waitingLocks,
	})
}

func (h *APIHandler) HealthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"status":    "healthy",
		"timestamp": time.Now(),
	})
}

func (h *APIHandler) GetStrategyConfig(c *gin.Context) {
	sm := h.detector.GetStrategyManager()
	config := sm.GetConfig()

	c.JSON(http.StatusOK, gin.H{
		"data": config,
	})
}

func (h *APIHandler) UpdateStrategyConfig(c *gin.Context) {
	var req struct {
		ConfigName            string  `json:"config_name"`
		IsActive              bool    `json:"is_active"`
		Level1ThresholdSec    int     `json:"level1_threshold_sec"`
		Level1RetryDelaySec   int     `json:"level1_retry_delay_sec"`
		Level1MarkVictim      bool    `json:"level1_mark_victim"`
		Level2ThresholdSec    int     `json:"level2_threshold_sec"`
		Level2RetryDelaySec   int     `json:"level2_retry_delay_sec"`
		Level3ThresholdSec    int     `json:"level3_threshold_sec"`
		Level3RetryDelaySec   int     `json:"level3_retry_delay_sec"`
		Level3TriggerAlert    bool    `json:"level3_trigger_alert"`
		PredictQueueThreshold int     `json:"predict_queue_threshold"`
		PredictTrendWindow    int     `json:"predict_trend_window"`
		PredictTrendThreshold float64 `json:"predict_trend_threshold"`
		PredictEnabled        bool    `json:"predict_enabled"`
		DingtalkWebhook       string  `json:"dingtalk_webhook"`
		DingtalkSecret        string  `json:"dingtalk_secret"`
		Description           string  `json:"description"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	tx := config.DB.Begin()

	if req.IsActive {
		if err := tx.Model(&models.DeadlockStrategyConfig{}).
			Where("1 = 1").Update("is_active", false).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to deactivate existing configs",
			})
			return
		}
	}

	var config models.DeadlockStrategyConfig
	if err := tx.Where("config_name = ?", req.ConfigName).First(&config).Error; err != nil {
		config = models.DeadlockStrategyConfig{
			ConfigName: req.ConfigName,
		}
	}

	config.IsActive = req.IsActive
	config.Level1ThresholdSec = req.Level1ThresholdSec
	config.Level1RetryDelaySec = req.Level1RetryDelaySec
	config.Level1MarkVictim = req.Level1MarkVictim
	config.Level2ThresholdSec = req.Level2ThresholdSec
	config.Level2RetryDelaySec = req.Level2RetryDelaySec
	config.Level3ThresholdSec = req.Level3ThresholdSec
	config.Level3RetryDelaySec = req.Level3RetryDelaySec
	config.Level3TriggerAlert = req.Level3TriggerAlert
	config.PredictQueueThreshold = req.PredictQueueThreshold
	config.PredictTrendWindow = req.PredictTrendWindow
	config.PredictTrendThreshold = req.PredictTrendThreshold
	config.PredictEnabled = req.PredictEnabled
	config.DingtalkWebhook = req.DingtalkWebhook
	config.DingtalkSecret = req.DingtalkSecret
	config.Description = req.Description

	if err := tx.Save(&config).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to save config",
		})
		return
	}

	if err := tx.Commit().Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to commit transaction",
		})
		return
	}

	h.detector.GetStrategyManager().ReloadConfig()

	c.JSON(http.StatusOK, gin.H{
		"message": "Config updated successfully",
		"data":    config,
	})
}

func (h *APIHandler) TriggerPrediction(c *gin.Context) {
	go h.detector.TriggerPrediction()

	c.JSON(http.StatusAccepted, gin.H{
		"message": "Deadlock prediction triggered",
	})
}

func (h *APIHandler) GetPredictionHistory(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	if page < 1 {
		page = 1
	}
	if pageSize < 1 || pageSize > 100 {
		pageSize = 20
	}

	offset := (page - 1) * pageSize

	var predictions []models.PredictionEvent
	var total int64

	if err := config.DB.Model(&models.PredictionEvent{}).Count(&total).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to count prediction history",
		})
		return
	}

	if err := config.DB.Order("predicted_at DESC").Offset(offset).Limit(pageSize).Find(&predictions).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to fetch prediction history",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":        predictions,
		"total":       total,
		"page":        page,
		"page_size":   pageSize,
		"total_pages": (total + int64(pageSize) - 1) / int64(pageSize),
	})
}

func (h *APIHandler) SendTestAlert(c *gin.Context) {
	var req struct {
		Webhook string `json:"webhook" binding:"required"`
		Secret  string `json:"secret"`
		Title   string `json:"title"`
		Content string `json:"content"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": err.Error(),
		})
		return
	}

	if req.Title == "" {
		req.Title = "死锁告警测试"
	}
	if req.Content == "" {
		req.Content = "这是一条钉钉机器人测试消息！"
	}

	if err := detector.SendDingtalkMessage(req.Webhook, req.Secret, req.Title, req.Content); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to send test alert",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Test alert sent successfully",
	})
}

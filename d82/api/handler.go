package api

import (
	"net/http"
	"strconv"

	"ebpf-monitor/ebpf"
	"ebpf-monitor/pkg/logger"

	"github.com/gin-gonic/gin"
)

type AddIgnoreRuleRequest struct {
	PathPrefix string `json:"path_prefix" binding:"required,min=1,max=63"`
	RuleType   uint32 `json:"rule_type" binding:"oneof=0 1"`
	Enabled    bool   `json:"enabled"`
}

type Handler struct {
	logger  *logger.Logger
	monitor *ebpf.EbpfMonitor
}

func NewHandler(log *logger.Logger, monitor *ebpf.EbpfMonitor) *Handler {
	return &Handler{
		logger:  log,
		monitor: monitor,
	}
}

func (h *Handler) GetAllEvents(c *gin.Context) {
	events := h.logger.GetEvents()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    events,
		"count":   len(events),
	})
}

func (h *Handler) GetEventsByPID(c *gin.Context) {
	pidStr := c.Param("pid")
	pid, err := strconv.ParseUint(pidStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "invalid pid",
		})
		return
	}

	events := h.logger.GetEventsByPID(uint32(pid))
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    events,
		"count":   len(events),
	})
}

func (h *Handler) ClearEvents(c *gin.Context) {
	h.logger.Clear()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "events cleared",
	})
}

func (h *Handler) AddTargetPid(c *gin.Context) {
	var req struct {
		PID uint32 `json:"pid" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	if err := h.monitor.AddTargetPid(req.PID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "target pid added",
		"pid":     req.PID,
	})
}

func (h *Handler) RemoveTargetPid(c *gin.Context) {
	pidStr := c.Param("pid")
	pid, err := strconv.ParseUint(pidStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "invalid pid",
		})
		return
	}

	if err := h.monitor.RemoveTargetPid(uint32(pid)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "target pid removed",
		"pid":     pid,
	})
}

func (h *Handler) HealthCheck(c *gin.Context) {
	stats := h.monitor.GetStats()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"status":  "running",
		"stats":   stats,
	})
}

func (h *Handler) GetStats(c *gin.Context) {
	stats := h.monitor.GetStats()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"stats":   stats,
	})
}

func (h *Handler) AddIgnoreRule(c *gin.Context) {
	var req AddIgnoreRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	rule := ebpf.IgnoreRule{
		PathPrefix: req.PathPrefix,
		RuleType:   req.RuleType,
		Enabled:    req.Enabled,
	}

	if err := h.monitor.AddIgnoreRule(rule); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "ignore rule added",
		"rule":    rule,
	})
}

func (h *Handler) RemoveIgnoreRule(c *gin.Context) {
	pathPrefix := c.Query("path_prefix")
	if pathPrefix == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"error":   "path_prefix query parameter is required",
		})
		return
	}

	if err := h.monitor.RemoveIgnoreRule(pathPrefix); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "ignore rule removed",
	})
}

func (h *Handler) GetIgnoreRules(c *gin.Context) {
	rules := h.monitor.GetIgnoreRules()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    rules,
		"count":   len(rules),
	})
}

func (h *Handler) ClearAllIgnoreRules(c *gin.Context) {
	if err := h.monitor.ClearAllIgnoreRules(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"error":   err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "all ignore rules cleared",
	})
}

func SetupRoutes(r *gin.Engine, handler *Handler) {
	api := r.Group("/api/v1")
	{
		api.GET("/health", handler.HealthCheck)
		api.GET("/events", handler.GetAllEvents)
		api.GET("/events/:pid", handler.GetEventsByPID)
		api.DELETE("/events", handler.ClearEvents)
		api.POST("/targets", handler.AddTargetPid)
		api.DELETE("/targets/:pid", handler.RemoveTargetPid)
		api.GET("/stats", handler.GetStats)
		
		api.POST("/ignore-rules", handler.AddIgnoreRule)
		api.DELETE("/ignore-rules", handler.RemoveIgnoreRule)
		api.GET("/ignore-rules", handler.GetIgnoreRules)
		api.DELETE("/ignore-rules/all", handler.ClearAllIgnoreRules)
	}
}

package api

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"istio-fault-injection-engine/pkg/envoy"
	"istio-fault-injection-engine/pkg/models"
	"istio-fault-injection-engine/pkg/storage"
)

type Handler struct {
	store         *storage.EtcdStore
	filterGen     *envoy.EnvoyFilterGenerator
}

func NewHandler(store *storage.EtcdStore) *Handler {
	return &Handler{
		store:     store,
		filterGen: envoy.NewEnvoyFilterGenerator(),
	}
}

func (h *Handler) RegisterRoutes(r *gin.Engine) {
	api := r.Group("/api/v1")
	{
		rules := api.Group("/rules")
		{
			rules.POST("", h.CreateRule)
			rules.GET("", h.ListRules)
			rules.GET("/:id", h.GetRule)
			rules.PUT("/:id", h.UpdateRule)
			rules.DELETE("/:id", h.DeleteRule)
			rules.POST("/:id/versions/:version/rollback", h.RollbackRule)
			rules.GET("/:id/versions", h.ListVersions)
			rules.GET("/:id/envoyfilter", h.GenerateEnvoyFilter)
		}

		logs := api.Group("/logs")
		{
			logs.GET("", h.ListLogs)
			logs.POST("", h.CreateLog)
		}

		api.GET("/health", h.HealthCheck)
	}
}

type CreateRuleRequest struct {
	Name               string                       `json:"name" binding:"required"`
	Description        string                       `json:"description"`
	Namespace          string                       `json:"namespace" binding:"required"`
	Service            string                       `json:"service" binding:"required"`
	Enabled            bool                         `json:"enabled"`
	CanaryMode         models.CanaryConfig          `json:"canary_mode"`
	Match              models.MatchConfig           `json:"match" binding:"required"`
	Fault              models.FaultConfig           `json:"fault" binding:"required"`
	TimeoutAware       *models.TimeoutAwareConfig   `json:"timeout_aware,omitempty"`
	ConnectionLeakDetect *models.ConnectionLeakConfig `json:"connection_leak_detect,omitempty"`
	CreatedBy          string                       `json:"created_by"`
}

func (h *Handler) CreateRule(c *gin.Context) {
	var req CreateRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	rule := models.NewFaultRule()
	rule.Name = req.Name
	rule.Description = req.Description
	rule.Namespace = req.Namespace
	rule.Service = req.Service
	rule.Enabled = req.Enabled
	rule.CanaryMode = req.CanaryMode
	rule.Match = req.Match
	rule.Fault = req.Fault
	rule.CreatedBy = req.CreatedBy
	rule.UpdatedAt = time.Now()

	if req.TimeoutAware != nil {
		rule.TimeoutAware = *req.TimeoutAware
	}
	if req.ConnectionLeakDetect != nil {
		rule.ConnectionLeakDetect = *req.ConnectionLeakDetect
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := h.store.CreateRule(ctx, rule); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, rule)
}

func (h *Handler) ListRules(c *gin.Context) {
	namespace := c.Query("namespace")
	service := c.Query("service")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rules, err := h.store.ListRules(ctx, namespace, service)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": rules})
}

func (h *Handler) GetRule(c *gin.Context) {
	id := c.Param("id")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rule, err := h.store.GetRule(ctx, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rule not found"})
		return
	}

	c.JSON(http.StatusOK, rule)
}

type UpdateRuleRequest struct {
	Name                 string                         `json:"name"`
	Description          string                         `json:"description"`
	Enabled              *bool                          `json:"enabled"`
	CanaryMode           *models.CanaryConfig          `json:"canary_mode"`
	Match                *models.MatchConfig           `json:"match"`
	Fault                *models.FaultConfig           `json:"fault"`
	TimeoutAware         *models.TimeoutAwareConfig    `json:"timeout_aware"`
	ConnectionLeakDetect *models.ConnectionLeakConfig  `json:"connection_leak_detect"`
}

func (h *Handler) UpdateRule(c *gin.Context) {
	id := c.Param("id")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rule, err := h.store.GetRule(ctx, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rule not found"})
		return
	}

	var req UpdateRuleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Name != "" {
		rule.Name = req.Name
	}
	if req.Description != "" {
		rule.Description = req.Description
	}
	if req.Enabled != nil {
		rule.Enabled = *req.Enabled
	}
	if req.CanaryMode != nil {
		rule.CanaryMode = *req.CanaryMode
	}
	if req.Match != nil {
		rule.Match = *req.Match
	}
	if req.Fault != nil {
		rule.Fault = *req.Fault
	}
	if req.TimeoutAware != nil {
		rule.TimeoutAware = *req.TimeoutAware
	}
	if req.ConnectionLeakDetect != nil {
		rule.ConnectionLeakDetect = *req.ConnectionLeakDetect
	}
	rule.UpdatedAt = time.Now()

	if err := h.store.UpdateRule(ctx, rule); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, rule)
}

func (h *Handler) DeleteRule(c *gin.Context) {
	id := c.Param("id")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := h.store.DeleteRule(ctx, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Status(http.StatusNoContent)
}

func (h *Handler) RollbackRule(c *gin.Context) {
	id := c.Param("id")
	versionStr := c.Param("version")
	
	var versionNum int64
	if _, err := uuid.Parse(id); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid rule ID"})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := h.store.RollbackToVersion(ctx, id, versionNum); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	rule, err := h.store.GetRule(ctx, id)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "Rollback successful"})
		return
	}

	c.JSON(http.StatusOK, rule)
}

func (h *Handler) ListVersions(c *gin.Context) {
	id := c.Param("id")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	versions, err := h.store.GetVersions(ctx, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": versions})
}

func (h *Handler) GenerateEnvoyFilter(c *gin.Context) {
	id := c.Param("id")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rule, err := h.store.GetRule(ctx, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rule not found"})
		return
	}

	filterType := c.DefaultQuery("type", "wasm")
	format := c.DefaultQuery("format", "yaml")
	
	var data []byte
	if format == "json" {
		data, err = h.filterGen.GenerateJSON(rule)
	} else {
		switch filterType {
		case "lua":
			data, err = h.filterGen.GenerateLuaFilter(rule)
		case "native":
			data, err = h.filterGen.GenerateNativeFaultFilter(rule)
		default:
			data, err = h.filterGen.GenerateWasmFilter(rule)
		}
	}

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Data(http.StatusOK, "application/x-yaml", data)
}

type CreateLogRequest struct {
	RuleID      string                 `json:"rule_id" binding:"required"`
	RequestID   string                 `json:"request_id"`
	SourceIP    string                 `json:"source_ip"`
	Destination string                 `json:"destination"`
	Path        string                 `json:"path"`
	Method      string                 `json:"method"`
	UserID      string                 `json:"user_id"`
	Headers     map[string]string      `json:"headers"`
	ImpactDetails map[string]interface{} `json:"impact_details"`
}

func (h *Handler) CreateLog(c *gin.Context) {
	var req CreateLogRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	rule, err := h.store.GetRule(ctx, req.RuleID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Rule not found"})
		return
	}

	log := models.NewFaultLog(rule)
	log.RequestID = req.RequestID
	log.SourceIP = req.SourceIP
	log.Destination = req.Destination
	log.Path = req.Path
	log.Method = req.Method
	log.UserID = req.UserID
	log.Headers = req.Headers
	log.ImpactDetails = req.ImpactDetails

	if err := h.store.CreateLog(ctx, log); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, log)
}

func (h *Handler) ListLogs(c *gin.Context) {
	ruleID := c.Query("rule_id")
	
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	logs, err := h.store.ListLogs(ctx, ruleID, time.Time{}, time.Time{}, 100)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": logs})
}

func (h *Handler) HealthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "healthy"})
}

package api

import (
	"context"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"istio-fault-injection-engine/pkg/chaos"
	"istio-fault-injection-engine/pkg/models"
	"istio-fault-injection-engine/pkg/storage"
)

type ChaosHandler struct {
	store       *storage.EtcdStore
	collector   *chaos.PrometheusCollector
	recommender *chaos.RecommendationEngine
	executor    *chaos.ExperimentExecutor
}

func NewChaosHandler(store *storage.EtcdStore, prometheusAddress string) *ChaosHandler {
	config := models.ChaosEngineConfig{
		PrometheusConfig: models.PrometheusConfig{
			Address:             prometheusAddress,
			QueryTimeoutSeconds: 30,
			LookbackDays:        7,
			StepSeconds:         60,
		},
		IsolationForestConfig: models.IsolationForestConfig{
			NumTrees:           100,
			MaxSamples:         256,
			Contamination:      0.1,
			AnomalyThreshold:   0.5,
			MinDataPoints:      10,
		},
		SLOConfig: models.SLOConfig{
			Enabled:                  true,
			MaxLatencyP95MS:         1000,
			MaxErrorRatePercent:     5.0,
			MinSuccessRatePercent:   95.0,
			MaxSaturationPercent:    90.0,
			ViolationThresholdCount: 3,
			ViolationWindowSeconds:  300,
			AutoRollbackEnabled:     true,
		},
		DefaultDurationSeconds:   300,
		MonitoringIntervalSeconds: 10,
		MaxParallelExperiments:  5,
	}

	collector := chaos.NewPrometheusCollector(config.PrometheusConfig)
	recommender := chaos.NewRecommendationEngine(config, collector)
	executor := chaos.NewExperimentExecutor(store, recommender)

	return &ChaosHandler{
		store:       store,
		collector:   collector,
		recommender: recommender,
		executor:    executor,
	}
}

func (h *ChaosHandler) RegisterRoutes(r *gin.Engine) {
	api := r.Group("/api/v1/chaos")
	{
		metrics := api.Group("/metrics")
		{
			metrics.GET("/services/:namespace", h.GetServiceMetrics)
			metrics.GET("/dependencies/:namespace", h.GetServiceDependencies)
			metrics.GET("/anomalies/:namespace", h.DetectAnomalies)
		}

		recommendations := api.Group("/recommendations")
		{
			recommendations.POST("/generate/:namespace", h.GenerateRecommendations)
			recommendations.GET("", h.ListRecommendations)
			recommendations.GET("/:id", h.GetRecommendation)
		}

		executions := api.Group("/executions")
		{
			executions.POST("", h.CreateExecution)
			executions.GET("", h.ListExecutions)
			executions.GET("/:id", h.GetExecution)
			executions.POST("/:id/start", h.StartExecution)
			executions.POST("/:id/pause", h.PauseExecution)
			executions.POST("/:id/stop", h.StopExecution)
			executions.POST("/:id/rollback", h.RollbackExecution)
			executions.GET("/:id/report", h.GenerateReport)
		}

		config := api.Group("/config")
		{
			config.GET("", h.GetConfig)
			config.POST("", h.UpdateConfig)
		}
	}
}

type GetServiceMetricsResponse struct {
	Data []*models.ServiceMetrics `json:"data"`
}

func (h *ChaosHandler) GetServiceMetrics(c *gin.Context) {
	namespace := c.Param("namespace")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	metrics, err := h.collector.CollectServiceMetrics(ctx, namespace)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, GetServiceMetricsResponse{Data: metrics})
}

type GetServiceDependenciesResponse struct {
	Data []*models.ServiceDependency `json:"data"`
}

func (h *ChaosHandler) GetServiceDependencies(c *gin.Context) {
	namespace := c.Param("namespace")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	dependencies, err := h.collector.CollectServiceDependencies(ctx, namespace)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, GetServiceDependenciesResponse{Data: dependencies})
}

type DetectAnomaliesResponse struct {
	WeakPoints []*models.WeakPoint      `json:"weak_points"`
	Scores     map[string]float64 `json:"scores"`
}

func (h *ChaosHandler) DetectAnomalies(c *gin.Context) {
	namespace := c.Param("namespace")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	metrics, err := h.collector.CollectServiceMetrics(ctx, namespace)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	result := h.recommender.DetectWeakPoints(metrics)

	c.JSON(http.StatusOK, DetectAnomaliesResponse{
		WeakPoints: result.WeakPoints,
		Scores:     result.Scores,
	})
}

type GenerateRecommendationsRequest struct {
	Namespace string `json:"namespace" binding:"required"`
}

type GenerateRecommendationsResponse struct {
	Data []*models.ExperimentRecommendation `json:"data"`
}

func (h *ChaosHandler) GenerateRecommendations(c *gin.Context) {
	namespace := c.Param("namespace")

	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	recommendations, err := h.recommender.GenerateRecommendations(ctx, namespace)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, GenerateRecommendationsResponse{Data: recommendations})
}

var recommendationsCache = make(map[string]*models.ExperimentRecommendation)

func (h *ChaosHandler) ListRecommendations(c *gin.Context) {
	var list []*models.ExperimentRecommendation
	for _, rec := range recommendationsCache {
		list = append(list, rec)
	}
	c.JSON(http.StatusOK, gin.H{"data": list})
}

func (h *ChaosHandler) GetRecommendation(c *gin.Context) {
	id := c.Param("id")
	rec, exists := recommendationsCache[id]
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "Recommendation not found"})
		return
	}
	c.JSON(http.StatusOK, rec)
}

type CreateExecutionRequest struct {
	RecommendationID string `json:"recommendation_id" binding:"required"`
}

type CreateExecutionResponse struct {
	ExecutionID string `json:"execution_id"`
}

func (h *ChaosHandler) CreateExecution(c *gin.Context) {
	var req CreateExecutionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	rec, exists := recommendationsCache[req.RecommendationID]
	if !exists {
		c.JSON(http.StatusNotFound, gin.H{"error": "Recommendation not found"})
		return
	}

	execution := h.executor.CreateExecution(rec)

	c.JSON(http.StatusCreated, CreateExecutionResponse{ExecutionID: execution.ID})
}

func (h *ChaosHandler) ListExecutions(c *gin.Context) {
	executions := h.executor.ListExecutions()
	c.JSON(http.StatusOK, gin.H{"data": executions})
}

func (h *ChaosHandler) GetExecution(c *gin.Context) {
	id := c.Param("id")
	execution, err := h.executor.GetExecution(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, execution)
}

func (h *ChaosHandler) StartExecution(c *gin.Context) {
	id := c.Param("id")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := h.executor.StartExecution(ctx, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "started"})
}

func (h *ChaosHandler) PauseExecution(c *gin.Context) {
	id := c.Param("id")

	if err := h.executor.PauseExecution(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "paused"})
}

func (h *ChaosHandler) StopExecution(c *gin.Context) {
	id := c.Param("id")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := h.executor.StopExecution(ctx, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "stopped"})
}

func (h *ChaosHandler) RollbackExecution(c *gin.Context) {
	id := c.Param("id")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := h.executor.StopExecution(ctx, id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "rolled_back"})
}

func (h *ChaosHandler) GenerateReport(c *gin.Context) {
	id := c.Param("id")

	report, err := h.executor.GenerateReport(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, report)
}

func (h *ChaosHandler) GetConfig(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"prometheus": gin.H{
			"address":               "http://prometheus:9090",
			"query_timeout_seconds": 30,
			"lookback_days":         7,
			"step_seconds":          60,
		},
		"isolation_forest": gin.H{
			"num_trees":         100,
			"max_samples":       256,
			"contamination":     0.1,
			"anomaly_threshold": 0.5,
			"min_data_points":   10,
		},
		"slo": gin.H{
			"enabled":                    true,
			"max_latency_p95_ms":         1000,
			"max_error_rate_percent":     5.0,
			"min_success_rate_percent":   95.0,
			"max_saturation_percent":    90.0,
			"violation_threshold_count":  3,
			"violation_window_seconds":  300,
			"auto_rollback_enabled":     true,
		},
		"default_duration_seconds":   300,
		"monitoring_interval_seconds": 10,
		"max_parallel_experiments":   5,
	})
}

type UpdateConfigRequest struct {
	Prometheus struct {
		Address             string `json:"address"`
		QueryTimeoutSeconds int    `json:"query_timeout_seconds"`
		LookbackDays        int    `json:"lookback_days"`
		StepSeconds         int    `json:"step_seconds"`
	} `json:"prometheus"`
	IsolationForest struct {
		NumTrees          int     `json:"num_trees"`
		MaxSamples        int     `json:"max_samples"`
		Contamination     float64 `json:"contamination"`
		AnomalyThreshold  float64 `json:"anomaly_threshold"`
		MinDataPoints     int     `json:"min_data_points"`
	} `json:"isolation_forest"`
	SLO struct {
		Enabled                  bool    `json:"enabled"`
		MaxLatencyP95MS         float64 `json:"max_latency_p95_ms"`
		MaxErrorRatePercent     float64 `json:"max_error_rate_percent"`
		MinSuccessRatePercent   float64 `json:"min_success_rate_percent"`
		MaxSaturationPercent    float64 `json:"max_saturation_percent"`
		ViolationThresholdCount  int     `json:"violation_threshold_count"`
		ViolationWindowSeconds  int64   `json:"violation_window_seconds"`
		AutoRollbackEnabled     bool    `json:"auto_rollback_enabled"`
	} `json:"slo"`
	DefaultDurationSeconds   int64 `json:"default_duration_seconds"`
	MonitoringIntervalSeconds int64 `json:"monitoring_interval_seconds"`
	MaxParallelExperiments   int   `json:"max_parallel_experiments"`
}

func (h *ChaosHandler) UpdateConfig(c *gin.Context) {
	var req UpdateConfigRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "updated"})
}

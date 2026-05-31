package models

import (
	"time"

	"github.com/google/uuid"
)

type ServiceMetrics struct {
	ServiceName    string            `json:"service_name"`
	Namespace      string            `json:"namespace"`
	LatencyP50    float64           `json:"latency_p50_ms"`
	LatencyP95    float64           `json:"latency_p95_ms"`
	LatencyP99    float64           `json:"latency_p99_ms"`
	ErrorRate     float64           `json:"error_rate_percent"`
	TrafficQPS    float64           `json:"traffic_qps"`
	Saturation    float64           `json:"saturation_percent"`
	CPUUsage      float64           `json:"cpu_usage_percent"`
	MemoryUsage   float64           `json:"memory_usage_percent"`
	PodCount      int               `json:"pod_count"`
	Timestamp     time.Time         `json:"timestamp"`
}

type WeakPoint struct {
	ID             string         `json:"id"`
	ServiceName    string         `json:"service_name"`
	Namespace      string         `json:"namespace"`
	Endpoint       string         `json:"endpoint,omitempty"`
	MetricType     string         `json:"metric_type"`
	AnomalyScore   float64        `json:"anomaly_score"`
	Severity       string         `json:"severity"`
	Description    string         `json:"description"`
	HistoricalData *ServiceMetrics `json:"historical_data"`
	DetectedAt     time.Time      `json:"detected_at"`
}

func NewWeakPoint() *WeakPoint {
	return &WeakPoint{
		ID:         uuid.New().String(),
		DetectedAt: time.Now(),
	}
}

type ExperimentRecommendation struct {
	ID                  string              `json:"id"`
	Name                string              `json:"name"`
	Description         string              `json:"description"`
	WeakPoints          []*WeakPoint        `json:"weak_points"`
	FaultCombinations   []*FaultExperiment  `json:"fault_combinations"`
	ImpactRadius        ImpactAssessment    `json:"impact_radius"`
	EstimatedRollbackTime int64            `json:"estimated_rollback_time_seconds"`
	Priority            int                 `json:"priority"`
	Confidence          float64             `json:"confidence_score"`
	GeneratedAt         time.Time           `json:"generated_at"`
	Status              string              `json:"status"`
}

func NewExperimentRecommendation() *ExperimentRecommendation {
	return &ExperimentRecommendation{
		ID:          uuid.New().String(),
		GeneratedAt: time.Now(),
		Status:      "pending",
	}
}

type FaultExperiment struct {
	ID               string           `json:"id"`
	RuleID           string           `json:"rule_id,omitempty"`
	TargetService    string           `json:"target_service"`
	Namespace        string           `json:"namespace"`
	Endpoint         string           `json:"endpoint,omitempty"`
	FaultType        string           `json:"fault_type"`
	FaultConfig      FaultConfig      `json:"fault_config"`
	DurationSeconds  int64            `json:"duration_seconds"`
	MatchConfig      MatchConfig      `json:"match_config"`
	ExpectedImpact   string           `json:"expected_impact"`
}

func NewFaultExperiment() *FaultExperiment {
	return &FaultExperiment{
		ID: uuid.New().String(),
	}
}

type ImpactAssessment struct {
	EstimatedAffectedServices int     `json:"estimated_affected_services"`
	EstimatedTrafficImpact    float64 `json:"estimated_traffic_impact_percent"`
	EstimatedErrorRateIncrease float64 `json:"estimated_error_rate_increase_percent"`
	EstimatedLatencyIncrease  float64 `json:"estimated_latency_increase_ms"`
	RiskLevel                 string  `json:"risk_level"`
	RecommendedBlastRadius    float64 `json:"recommended_blast_radius_percent"`
}

type ExperimentExecution struct {
	ID                    string                      `json:"id"`
	RecommendationID      string                      `json:"recommendation_id"`
	Name                  string                      `json:"name"`
	Status                string                      `json:"status"`
	Phase                 string                      `json:"phase"`
	StartedAt             *time.Time                  `json:"started_at,omitempty"`
	CompletedAt           *time.Time                  `json:"completed_at,omitempty"`
	BaselineMetrics       map[string]*ServiceMetrics  `json:"baseline_metrics"`
	CurrentMetrics        map[string]*ServiceMetrics  `json:"current_metrics"`
	SLOViolations         []SLOViolation              `json:"slo_violations"`
	AutoRollbackTriggered bool                        `json:"auto_rollback_triggered"`
	ExecutedFaults        []ExecutedFault             `json:"executed_faults"`
	ResultSummary         string                      `json:"result_summary,omitempty"`
	CreatedAt             time.Time                   `json:"created_at"`
}

func NewExperimentExecution() *ExperimentExecution {
	return &ExperimentExecution{
		ID:        uuid.New().String(),
		Status:    "created",
		Phase:     "pending",
		CreatedAt: time.Now(),
	}
}

type ExecutedFault struct {
	FaultID         string    `json:"fault_id"`
	RuleID          string    `json:"rule_id"`
	TargetService   string    `json:"target_service"`
	FaultType       string    `json:"fault_type"`
	StartedAt       time.Time `json:"started_at"`
	CompletedAt     time.Time `json:"completed_at,omitempty"`
	Status          string    `json:"status"`
	ObservedImpact  string    `json:"observed_impact,omitempty"`
}

type SLOViolation struct {
	Timestamp   time.Time `json:"timestamp"`
	MetricType  string    `json:"metric_type"`
	Threshold   float64   `json:"threshold"`
	ActualValue float64   `json:"actual_value"`
	Severity    string    `json:"severity"`
	Description string    `json:"description"`
}

type SLOConfig struct {
	Enabled                  bool    `json:"enabled"`
	MaxLatencyP95MS         float64 `json:"max_latency_p95_ms"`
	MaxErrorRatePercent     float64 `json:"max_error_rate_percent"`
	MinSuccessRatePercent   float64 `json:"min_success_rate_percent"`
	MaxSaturationPercent    float64 `json:"max_saturation_percent"`
	ViolationThresholdCount  int     `json:"violation_threshold_count"`
	ViolationWindowSeconds  int64   `json:"violation_window_seconds"`
	AutoRollbackEnabled     bool    `json:"auto_rollback_enabled"`
}

type ExperimentReport struct {
	ID                 string                 `json:"id"`
	ExecutionID        string                 `json:"execution_id"`
	RecommendationID   string                 `json:"recommendation_id"`
	Name               string                 `json:"name"`
	Summary            string                 `json:"summary"`
	Findings           []string               `json:"findings"`
	Recommendations    []string               `json:"recommendations"`
	BaselineMetrics    map[string]*ServiceMetrics `json:"baseline_metrics"`
	ExperimentMetrics  map[string]*ServiceMetrics `json:"experiment_metrics"`
	ImpactAnalysis     ImpactAssessment       `json:"impact_analysis"`
	SLOViolations      []SLOViolation         `json:"slo_violations"`
	ExecutedFaults     []ExecutedFault        `json:"executed_faults"`
	GeneratedAt        time.Time              `json:"generated_at"`
}

func NewExperimentReport() *ExperimentReport {
	return &ExperimentReport{
		ID:          uuid.New().String(),
		GeneratedAt: time.Now(),
	}
}

type PrometheusConfig struct {
	Address             string `json:"address"`
	QueryTimeoutSeconds int   `json:"query_timeout_seconds"`
	LookbackDays        int   `json:"lookback_days"`
	StepSeconds         int   `json:"step_seconds"`
}

type IsolationForestConfig struct {
	NumTrees           int     `json:"num_trees"`
	MaxSamples         int     `json:"max_samples"`
	Contamination      float64 `json:"contamination"`
	AnomalyThreshold   float64 `json:"anomaly_threshold"`
	MinDataPoints      int     `json:"min_data_points"`
}

type ChaosEngineConfig struct {
	PrometheusConfig    PrometheusConfig     `json:"prometheus_config"`
	IsolationForestConfig IsolationForestConfig `json:"isolation_forest_config"`
	SLOConfig           SLOConfig            `json:"slo_config"`
	DefaultDurationSeconds int64            `json:"default_duration_seconds"`
	MonitoringIntervalSeconds int64         `json:"monitoring_interval_seconds"`
	MaxParallelExperiments int              `json:"max_parallel_experiments"`
}

type ServiceDependency struct {
	SourceService string `json:"source_service"`
	TargetService string `json:"target_service"`
	CallCount     int64  `json:"call_count"`
	ErrorRate     float64 `json:"error_rate"`
	AvgLatencyMS  float64 `json:"avg_latency_ms"`
}

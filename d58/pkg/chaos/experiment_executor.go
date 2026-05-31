package chaos

import (
	"context"
	"fmt"
	"sync"
	"time"

	"istio-fault-injection-engine/pkg/models"
	"istio-fault-injection-engine/pkg/storage"
)

type ExecutionStatus string

const (
	StatusCreated    ExecutionStatus = "created"
	StatusRunning    ExecutionStatus = "running"
	StatusPaused     ExecutionStatus = "paused"
	StatusCompleted  ExecutionStatus = "completed"
	StatusRollingBack ExecutionStatus = "rolling_back"
	StatusFailed     ExecutionStatus = "failed"
	StatusCancelled  ExecutionStatus = "cancelled"
)

type Phase string

const (
	PhaseBaseline    Phase = "baseline"
	PhaseFaultInjection Phase = "fault_injection"
	PhaseObservation  Phase = "observation"
	PhaseRollback     Phase = "rollback"
	PhaseCompleted    Phase = "completed"
)

type ExperimentExecutor struct {
	store       *storage.EtcdStore
	recommender *RecommendationEngine
	executions  map[string]*models.ExperimentExecution
	mu          sync.RWMutex
	stopChan    chan struct{}
}

func NewExperimentExecutor(store *storage.EtcdStore, recommender *RecommendationEngine) *ExperimentExecutor {
	return &ExperimentExecutor{
		store:       store,
		recommender: recommender,
		executions:  make(map[string]*models.ExperimentExecution),
		stopChan:    make(chan struct{}),
	}
}

func (e *ExperimentExecutor) CreateExecution(recommendation *models.ExperimentRecommendation) *models.ExperimentExecution {
	execution := models.NewExperimentExecution()
	execution.RecommendationID = recommendation.ID
	execution.Name = recommendation.Name
	execution.Status = string(StatusCreated)
	execution.Phase = string(PhaseBaseline)

	e.mu.Lock()
	e.executions[execution.ID] = execution
	e.mu.Unlock()

	return execution
}

func (e *ExperimentExecutor) StartExecution(ctx context.Context, executionID string) error {
	e.mu.Lock()
	execution, exists := e.executions[executionID]
	e.mu.Unlock()

	if !exists {
		return fmt.Errorf("execution not found: %s", executionID)
	}

	if execution.Status != string(StatusCreated) && execution.Status != string(StatusPaused) {
		return fmt.Errorf("cannot start execution in status: %s", execution.Status)
	}

	now := time.Now()
	execution.StartedAt = &now
	execution.Status = string(StatusRunning)
	execution.Phase = string(PhaseBaseline)

	go e.runExecution(ctx, execution)

	return nil
}

func (e *ExperimentExecutor) runExecution(ctx context.Context, execution *models.ExperimentExecution) {
	defer func() {
		if r := recover(); r != nil {
			e.updateStatus(execution, string(StatusFailed), fmt.Sprintf("panic recovered: %v", r))
		}
	}()

	if err := e.collectBaselineMetrics(ctx, execution); err != nil {
		e.updateStatus(execution, string(StatusFailed), fmt.Sprintf("baseline collection failed: %v", err))
		return
	}

	execution.Phase = string(PhaseFaultInjection)

	if err := e.injectFaults(ctx, execution); err != nil {
		e.rollback(ctx, execution, err.Error())
		return
	}

	execution.Phase = string(PhaseObservation)

	if err := e.monitorDuringExperiment(ctx, execution); err != nil {
		e.rollback(ctx, execution, err.Error())
		return
	}

	execution.Phase = string(PhaseRollback)

	if err := e.rollbackFaults(ctx, execution); err != nil {
		e.updateStatus(execution, string(StatusFailed), fmt.Sprintf("rollback failed: %v", err))
		return
	}

	e.completeExecution(execution)
}

func (e *ExperimentExecutor) collectBaselineMetrics(ctx context.Context, execution *models.ExperimentExecution) error {
	baseline := make(map[string]*models.ServiceMetrics)

	for _, fault := range execution.ExecutedFaults {
		service := fault.TargetService
		metrics, err := e.collectServiceMetrics(ctx, service)
		if err != nil {
			return err
		}
		baseline[service] = metrics
	}

	execution.BaselineMetrics = baseline
	return nil
}

func (e *ExperimentExecutor) collectServiceMetrics(ctx context.Context, service string) (*models.ServiceMetrics, error) {
	return &models.ServiceMetrics{
		ServiceName: service,
		Timestamp:   time.Now(),
		LatencyP50:  50.0,
		LatencyP95:  100.0,
		LatencyP99:  200.0,
		ErrorRate:   0.5,
		TrafficQPS:  100.0,
		Saturation:  30.0,
		CPUUsage:    40.0,
		MemoryUsage: 50.0,
	}, nil
}

func (e *ExperimentExecutor) injectFaults(ctx context.Context, execution *models.ExperimentExecution) error {
	for i, fault := range execution.ExecutedFaults {
		rule := e.convertFaultToRule(fault)

		ruleID, err := e.storeRule(ctx, rule)
		if err != nil {
			return fmt.Errorf("failed to store rule for fault %d: %w", i, err)
		}

		execution.ExecutedFaults[i].RuleID = ruleID
		execution.ExecutedFaults[i].StartedAt = time.Now()
		execution.ExecutedFaults[i].Status = "active"
	}

	return nil
}

func (e *ExperimentExecutor) convertFaultToRule(fault models.ExecutedFault) *models.FaultRule {
	rule := models.NewFaultRule()
	rule.Name = fmt.Sprintf("experiment-%s-%s", fault.FaultID, fault.FaultType)
	rule.Service = fault.TargetService
	rule.Enabled = true
	rule.Fault = models.FaultConfig{
		Type: models.FaultType(fault.FaultType),
	}
	return rule
}

func (e *ExperimentExecutor) storeRule(ctx context.Context, rule *models.FaultRule) (string, error) {
	if err := e.store.CreateRule(ctx, rule); err != nil {
		return "", err
	}
	return rule.ID, nil
}

func (e *ExperimentExecutor) monitorDuringExperiment(ctx context.Context, execution *models.ExperimentExecution) error {
	monitorInterval := time.Duration(e.recommender.config.MonitoringIntervalSeconds) * time.Second
	maxViolations := e.recommender.config.SLOConfig.ViolationThresholdCount
	violationCount := 0

	ticker := time.NewTicker(monitorInterval)
	defer ticker.Stop()

	timeout := time.After(30 * time.Minute)

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-timeout:
			return nil
		case <-ticker.C:
			current, violations, err := e.recommender.MonitorExperimentMetrics(
				ctx, execution, execution.BaselineMetrics)
			if err != nil {
				continue
			}

			execution.CurrentMetrics = current
			execution.SLOViolations = append(execution.SLOViolations, violations...)

			if len(violations) > 0 {
				violationCount++
				if violationCount >= maxViolations && e.recommender.config.SLOConfig.AutoRollbackEnabled {
					execution.AutoRollbackTriggered = true
					return fmt.Errorf("SLO violation threshold exceeded: %d violations", violationCount)
				}
			}
		}
	}
}

func (e *ExperimentExecutor) rollback(ctx context.Context, execution *models.ExperimentExecution, reason string) error {
	e.updateStatus(execution, string(StatusRollingBack), reason)

	if err := e.rollbackFaults(ctx, execution); err != nil {
		return err
	}

	e.updateStatus(execution, string(StatusFailed), reason)
	return nil
}

func (e *ExperimentExecutor) rollbackFaults(ctx context.Context, execution *models.ExperimentExecution) error {
	for i, fault := range execution.ExecutedFaults {
		if fault.RuleID != "" {
			if err := e.store.DeleteRule(ctx, fault.RuleID); err != nil {
				return fmt.Errorf("failed to delete rule %s: %w", fault.RuleID, err)
			}
		}

		now := time.Now()
		execution.ExecutedFaults[i].CompletedAt = now
		execution.ExecutedFaults[i].Status = "rolled_back"
	}

	return nil
}

func (e *ExperimentExecutor) completeExecution(execution *models.ExperimentExecution) {
	now := time.Now()
	execution.CompletedAt = &now
	execution.Status = string(StatusCompleted)
	execution.Phase = string(PhaseCompleted)

	summary := fmt.Sprintf("Experiment completed successfully. %d faults executed, %d SLO violations detected",
		len(execution.ExecutedFaults), len(execution.SLOViolations))
	execution.ResultSummary = summary
}

func (e *ExperimentExecutor) updateStatus(execution *models.ExperimentExecution, status, message string) {
	execution.Status = status
	execution.ResultSummary = message
}

func (e *ExperimentExecutor) PauseExecution(executionID string) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	execution, exists := e.executions[executionID]
	if !exists {
		return fmt.Errorf("execution not found: %s", executionID)
	}

	if execution.Status != string(StatusRunning) {
		return fmt.Errorf("cannot pause execution in status: %s", execution.Status)
	}

	execution.Status = string(StatusPaused)
	return nil
}

func (e *ExperimentExecutor) StopExecution(ctx context.Context, executionID string) error {
	e.mu.Lock()
	execution, exists := e.executions[executionID]
	e.mu.Unlock()

	if !exists {
		return fmt.Errorf("execution not found: %s", executionID)
	}

	if err := e.rollbackFaults(ctx, execution); err != nil {
		return err
	}

	execution.Status = string(StatusCancelled)
	return nil
}

func (e *ExperimentExecutor) GetExecution(executionID string) (*models.ExperimentExecution, error) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	execution, exists := e.executions[executionID]
	if !exists {
		return nil, fmt.Errorf("execution not found: %s", executionID)
	}

	return execution, nil
}

func (e *ExperimentExecutor) ListExecutions() []*models.ExperimentExecution {
	e.mu.RLock()
	defer e.mu.RUnlock()

	executions := make([]*models.ExperimentExecution, 0, len(e.executions))
	for _, e := range e.executions {
		executions = append(executions, e)
	}
	return executions
}

func (e *ExperimentExecutor) GenerateReport(executionID string) (*models.ExperimentReport, error) {
	e.mu.RLock()
	execution, exists := e.executions[executionID]
	e.mu.RUnlock()

	if !exists {
		return nil, fmt.Errorf("execution not found: %s", executionID)
	}

	report := models.NewExperimentReport()
	report.ExecutionID = execution.ID
	report.RecommendationID = execution.RecommendationID
	report.Name = execution.Name
	report.Summary = execution.ResultSummary
	report.BaselineMetrics = execution.BaselineMetrics
	report.ExperimentMetrics = execution.CurrentMetrics
	report.SLOViolations = execution.SLOViolations
	report.ExecutedFaults = execution.ExecutedFaults

	findings := e.analyzeFindings(execution)
	report.Findings = findings

	recommendations := e.generateRecommendations(execution)
	report.Recommendations = recommendations

	if execution.BaselineMetrics != nil && execution.CurrentMetrics != nil {
		report.ImpactAnalysis = e.calculateActualImpact(execution.BaselineMetrics, execution.CurrentMetrics)
	}

	return report, nil
}

func (e *ExperimentExecutor) analyzeFindings(execution *models.ExperimentExecution) []string {
	var findings []string

	if execution.AutoRollbackTriggered {
		findings = append(findings, "Auto-rollback was triggered due to SLO violations")
	}

	if len(execution.SLOViolations) > 0 {
		criticalCount := 0
		for _, v := range execution.SLOViolations {
			if v.Severity == "critical" {
				criticalCount++
			}
		}
		findings = append(findings, fmt.Sprintf("Detected %d SLO violations (%d critical)",
			len(execution.SLOViolations), criticalCount))
	}

	if execution.Status == string(StatusCompleted) {
		findings = append(findings, "Experiment completed successfully without triggering auto-rollback")
	}

	if len(execution.ExecutedFaults) > 0 {
		findings = append(findings, fmt.Sprintf("Successfully executed %d fault injections", len(execution.ExecutedFaults)))
	}

	return findings
}

func (e *ExperimentExecutor) generateRecommendations(execution *models.ExperimentExecution) []string {
	var recommendations []string

	if len(execution.SLOViolations) > 0 {
		recommendations = append(recommendations, "Review the service's error handling and timeout configurations")
		recommendations = append(recommendations, "Consider implementing circuit breakers for downstream dependencies")
	}

	if execution.AutoRollbackTriggered {
		recommendations = append(recommendations, "The service requires additional resilience improvements before production deployment")
	}

	if len(execution.ExecutedFaults) > 0 {
		recommendations = append(recommendations, "Continue running periodic chaos experiments to maintain resilience")
		recommendations = append(recommendations, "Consider expanding the scope of fault types and target services")
	}

	return recommendations
}

func (e *ExperimentExecutor) calculateActualImpact(
	baseline, current map[string]*models.ServiceMetrics,
) models.ImpactAssessment {
	impact := models.ImpactAssessment{}

	for service, baselineMetric := range baseline {
		currentMetric, exists := current[service]
		if !exists {
			continue
		}

		latencyIncrease := ((currentMetric.LatencyP95 - baselineMetric.LatencyP95) / baselineMetric.LatencyP95) * 100
		errorIncrease := currentMetric.ErrorRate - baselineMetric.ErrorRate

		if latencyIncrease > impact.EstimatedLatencyIncrease {
			impact.EstimatedLatencyIncrease = latencyIncrease
		}

		if errorIncrease > impact.EstimatedErrorRateIncrease {
			impact.EstimatedErrorRateIncrease = errorIncrease
		}

		impact.EstimatedAffectedServices++
	}

	if impact.EstimatedLatencyIncrease > 500 || impact.EstimatedErrorRateIncrease > 10 {
		impact.RiskLevel = "high"
	} else if impact.EstimatedLatencyIncrease > 200 || impact.EstimatedErrorRateIncrease > 5 {
		impact.RiskLevel = "medium"
	} else {
		impact.RiskLevel = "low"
	}

	return impact
}

func (e *ExperimentExecutor) Stop() {
	close(e.stopChan)
}

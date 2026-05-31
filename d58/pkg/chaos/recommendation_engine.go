package chaos

import (
	"context"
	"fmt"
	"sort"
	"time"

	"istio-fault-injection-engine/pkg/models"
)

type RecommendationEngine struct {
	config     models.ChaosEngineConfig
	collector  *PrometheusCollector
	iforest    *IsolationForest
}

func NewRecommendationEngine(config models.ChaosEngineConfig, collector *PrometheusCollector) *RecommendationEngine {
	return &RecommendationEngine{
		config:    config,
		collector: collector,
		iforest:   NewIsolationForest(config.IsolationForestConfig),
	}
}

func (re *RecommendationEngine) GenerateRecommendations(ctx context.Context, namespace string) ([]*models.ExperimentRecommendation, error) {
	metrics, err := re.collector.CollectServiceMetrics(ctx, namespace)
	if err != nil {
		return nil, fmt.Errorf("failed to collect metrics: %w", err)
	}

	if len(metrics) == 0 {
		return nil, fmt.Errorf("no service metrics collected")
	}

	dependencies, err := re.collector.CollectServiceDependencies(ctx, namespace)
	if err != nil {
		dependencies = []*models.ServiceDependency{}
	}

	anomalyResult := re.iforest.DetectWeakPoints(metrics)
	if len(anomalyResult.WeakPoints) == 0 {
		return re.generateBaseRecommendations(metrics, dependencies, namespace), nil
	}

	return re.generateTargetedRecommendations(anomalyResult.WeakPoints, metrics, dependencies, namespace), nil
}

func (re *RecommendationEngine) generateBaseRecommendations(
	metrics []*models.ServiceMetrics,
	dependencies []*models.ServiceDependency,
	namespace string,
) []*models.ExperimentRecommendation {
	var recommendations []*models.ExperimentRecommendation

	sortedMetrics := re.sortServicesByRisk(metrics)
	limit := 3
	if len(sortedMetrics) < limit {
		limit = len(sortedMetrics)
	}

	for i := 0; i < limit; i++ {
		m := sortedMetrics[i]
		rec := models.NewExperimentRecommendation()
		rec.Name = fmt.Sprintf("%s-resilience-test", m.ServiceName)
		rec.Description = fmt.Sprintf("Automated resilience test for service %s to validate fault tolerance", m.ServiceName)
		rec.Priority = i + 1
		rec.Confidence = 0.6

		impact := re.assessImpact(m, []*models.WeakPoint{}, dependencies)
		rec.ImpactRadius = impact
		rec.EstimatedRollbackTime = re.estimateRollbackTime(impact)

		rec.FaultCombinations = re.generateFaultCombinations(m, namespace, impact)

		recommendations = append(recommendations, rec)
	}

	return recommendations
}

func (re *RecommendationEngine) generateTargetedRecommendations(
	weakPoints []*models.WeakPoint,
	metrics []*models.ServiceMetrics,
	dependencies []*models.ServiceDependency,
	namespace string,
) []*models.ExperimentRecommendation {
	var recommendations []*models.ExperimentRecommendation

	groups := re.groupWeakPointsByService(weakPoints)

	for service, wp := range groups {
		rec := models.NewExperimentRecommendation()
		rec.Name = fmt.Sprintf("%s-targeted-resilience-test", service)
		rec.Description = re.generateDescription(wp)
		rec.WeakPoints = wp
		rec.Confidence = re.calculateConfidence(wp)
		rec.Priority = re.calculatePriority(wp)

		var m *models.ServiceMetrics
		for _, mm := range metrics {
			if mm.ServiceName == service {
				m = mm
				break
			}
		}

		impact := re.assessImpact(m, wp, dependencies)
		rec.ImpactRadius = impact
		rec.EstimatedRollbackTime = re.estimateRollbackTime(impact)

		rec.FaultCombinations = re.generateFaultCombinations(m, namespace, impact)

		recommendations = append(recommendations, rec)
	}

	sort.Slice(recommendations, func(i, j int) bool {
		return recommendations[i].Priority < recommendations[j].Priority
	})

	return recommendations
}

func (re *RecommendationEngine) groupWeakPointsByService(weakPoints []*models.WeakPoint) map[string][]*models.WeakPoint {
	groups := make(map[string][]*models.WeakPoint)
	for _, wp := range weakPoints {
		groups[wp.ServiceName] = append(groups[wp.ServiceName], wp)
	}
	return groups
}

func (re *RecommendationEngine) generateDescription(weakPoints []*models.WeakPoint) string {
	if len(weakPoints) == 0 {
		return "General resilience test"
	}

	desc := "Detected anomalies: "
	for i, wp := range weakPoints {
		if i > 0 {
			desc += "; "
		}
		desc += fmt.Sprintf("%s (%s severity)", wp.MetricType, wp.Severity)
	}
	return desc
}

func (re *RecommendationEngine) calculateConfidence(weakPoints []*models.WeakPoint) float64 {
	if len(weakPoints) == 0 {
		return 0.5
	}

	totalScore := 0.0
	for _, wp := range weakPoints {
		totalScore += wp.AnomalyScore
	}
	return totalScore / float64(len(weakPoints))
}

func (re *RecommendationEngine) calculatePriority(weakPoints []*models.WeakPoint) int {
	severityScore := 0
	for _, wp := range weakPoints {
		switch wp.Severity {
		case "critical":
			severityScore += 4
		case "high":
			severityScore += 3
		case "medium":
			severityScore += 2
		case "low":
			severityScore += 1
		}
	}

	if severityScore >= 8 {
		return 1
	} else if severityScore >= 5 {
		return 2
	}
	return 3
}

func (re *RecommendationEngine) assessImpact(
	metric *models.ServiceMetrics,
	weakPoints []*models.WeakPoint,
	dependencies []*models.ServiceDependency,
) models.ImpactAssessment {
	affectedServices := re.countAffectedServices(metric.ServiceName, dependencies)
	trafficImpact := 30.0
	if metric != nil {
		trafficImpact = (metric.TrafficQPS / 1000) * 10
		if trafficImpact > 80 {
			trafficImpact = 80
		}
	}

	riskLevel := "medium"
	for _, wp := range weakPoints {
		if wp.Severity == "critical" {
			riskLevel = "high"
			break
		} else if wp.Severity == "high" && riskLevel == "medium" {
			riskLevel = "high"
		}
	}

	if riskLevel == "medium" && affectedServices > 5 {
		riskLevel = "high"
	}

	estimatedLatency := 1000.0
	if metric != nil {
		estimatedLatency = metric.LatencyP95 * 2
	}

	return models.ImpactAssessment{
		EstimatedAffectedServices: affectedServices,
		EstimatedTrafficImpact:    trafficImpact,
		EstimatedErrorRateIncrease: 15.0,
		EstimatedLatencyIncrease:  estimatedLatency,
		RiskLevel:                 riskLevel,
		RecommendedBlastRadius:    30.0,
	}
}

func (re *RecommendationEngine) countAffectedServices(serviceName string, dependencies []*models.ServiceDependency) int {
	affected := make(map[string]bool)
	queue := []string{serviceName}
	visited := make(map[string]bool)

	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]

		if visited[current] {
			continue
		}
		visited[current] = true

		for _, dep := range dependencies {
			if dep.SourceService == current && !affected[dep.TargetService] {
				affected[dep.TargetService] = true
				queue = append(queue, dep.TargetService)
			}
		}
	}

	return len(affected)
}

func (re *RecommendationEngine) estimateRollbackTime(impact models.ImpactAssessment) int64 {
	baseTime := int64(30)

	switch impact.RiskLevel {
	case "high":
		baseTime += 60
	case "medium":
		baseTime += 30
	}

	if impact.EstimatedAffectedServices > 3 {
		baseTime += int64(impact.EstimatedAffectedServices * 10)
	}

	return baseTime
}

func (re *RecommendationEngine) generateFaultCombinations(
	metric *models.ServiceMetrics,
	namespace string,
	impact models.ImpactAssessment,
) []*models.FaultExperiment {
	var experiments []*models.FaultExperiment

	if metric == nil {
		return experiments
	}

	blastRadius := impact.RecommendedBlastRadius

	if metric.LatencyP95 > 100 || (len(impact.RiskLevel) > 0 && impact.RiskLevel == "high") {
		exp := models.NewFaultExperiment()
		exp.TargetService = metric.ServiceName
		exp.Namespace = namespace
		exp.FaultType = "delay"
		exp.DurationSeconds = re.config.DefaultDurationSeconds
		exp.ExpectedImpact = fmt.Sprintf("Increase latency by %.0fms to validate timeout handling", impact.EstimatedLatencyIncrease)

		delayConfig := models.FaultConfig{
			Type: models.FaultTypeDelay,
			Delay: &models.DelayFault{
				DelayType: models.DelayTypeNormal,
				Normal: &models.NormalDelay{
					MeanMS:   int64(impact.EstimatedLatencyIncrease),
					StdDevMS: int64(impact.EstimatedLatencyIncrease / 4),
					MinMS:    int64(impact.EstimatedLatencyIncrease / 2),
					MaxMS:    int64(impact.EstimatedLatencyIncrease * 2),
				},
			},
		}
		exp.FaultConfig = delayConfig

		matchConfig := models.MatchConfig{
			Percentage: blastRadius,
		}
		exp.MatchConfig = matchConfig

		experiments = append(experiments, exp)
	}

	if metric.ErrorRate > 1.0 || (len(impact.RiskLevel) > 0 && impact.RiskLevel == "high") {
		exp := models.NewFaultExperiment()
		exp.TargetService = metric.ServiceName
		exp.Namespace = namespace
		exp.FaultType = "abort"
		exp.DurationSeconds = re.config.DefaultDurationSeconds
		exp.ExpectedImpact = fmt.Sprintf("Inject %.0f%% error rate increase to validate error handling", impact.EstimatedErrorRateIncrease)

		abortConfig := models.FaultConfig{
			Type: models.FaultTypeAbort,
			Abort: &models.AbortFault{
				AbortType:  models.AbortTypeHTTPStatus,
				HTTPStatus: intPtr(503),
			},
		}
		exp.FaultConfig = abortConfig

		matchConfig := models.MatchConfig{
			Percentage: blastRadius,
		}
		exp.MatchConfig = matchConfig

		experiments = append(experiments, exp)
	}

	if (metric.Saturation > 70 || metric.CPUUsage > 80 || metric.MemoryUsage > 80) && len(experiments) > 0 {
		exp := models.NewFaultExperiment()
		exp.TargetService = metric.ServiceName
		exp.Namespace = namespace
		exp.FaultType = "disconnect"
		exp.DurationSeconds = re.config.DefaultDurationSeconds
		exp.ExpectedImpact = "Simulate connection failures to validate connection pool handling"

		disconnectConfig := models.FaultConfig{
			Type: models.FaultTypeDisconnect,
			Disconnect: &models.DisconnectFault{
				DisconnectType: models.DisconnectTypeTCPReset,
			},
		}
		exp.FaultConfig = disconnectConfig

		matchConfig := models.MatchConfig{
			Percentage: blastRadius / 2,
		}
		exp.MatchConfig = matchConfig

		experiments = append(experiments, exp)
	}

	return experiments
}

func (re *RecommendationEngine) sortServicesByRisk(metrics []*models.ServiceMetrics) []*models.ServiceMetrics {
	riskScore := func(m *models.ServiceMetrics) float64 {
		return m.LatencyP99*0.3 + m.ErrorRate*2 + m.Saturation*0.5 + m.CPUUsage*0.2
	}

	sorted := make([]*models.ServiceMetrics, len(metrics))
	copy(sorted, metrics)
	sort.Slice(sorted, func(i, j int) bool {
		return riskScore(sorted[i]) > riskScore(sorted[j])
	})

	return sorted
}

func (re *RecommendationEngine) MonitorExperimentMetrics(
	ctx context.Context,
	execution *models.ExperimentExecution,
	baseline map[string]*models.ServiceMetrics,
) (map[string]*models.ServiceMetrics, []models.SLOViolation, error) {
	var serviceNames []string
	for service := range baseline {
		serviceNames = append(serviceNames, service)
	}

	current, err := re.collector.GetCurrentMetrics(ctx, serviceNames[0], serviceNames)
	if err != nil {
		return nil, nil, err
	}

	violations := re.detectSLOViolations(baseline, current)

	return current, violations, nil
}

func (re *RecommendationEngine) detectSLOViolations(
	baseline map[string]*models.ServiceMetrics,
	current map[string]*models.ServiceMetrics,
) []models.SLOViolation {
	var violations []models.SLOViolation
	config := re.config.SLOConfig

	for service, currentMetric := range current {
		baselineMetric, exists := baseline[service]
		if !exists {
			continue
		}

		if currentMetric.LatencyP95 > config.MaxLatencyP95MS {
			violations = append(violations, models.SLOViolation{
				Timestamp:   time.Now(),
				MetricType:  "latency_p95",
				Threshold:   config.MaxLatencyP95MS,
				ActualValue: currentMetric.LatencyP95,
				Severity:    "warning",
				Description: fmt.Sprintf("P95 latency exceeds SLO: %.2fms vs threshold %.2fms", currentMetric.LatencyP95, config.MaxLatencyP95MS),
			})
		}

		if currentMetric.ErrorRate > config.MaxErrorRatePercent {
			violations = append(violations, models.SLOViolation{
				Timestamp:   time.Now(),
				MetricType:  "error_rate",
				Threshold:   config.MaxErrorRatePercent,
				ActualValue: currentMetric.ErrorRate,
				Severity:    "critical",
				Description: fmt.Sprintf("Error rate exceeds SLO: %.2f%% vs threshold %.2f%%", currentMetric.ErrorRate, config.MaxErrorRatePercent),
			})
		}

		latencyIncrease := ((currentMetric.LatencyP95 - baselineMetric.LatencyP95) / baselineMetric.LatencyP95) * 100
		if latencyIncrease > 200 {
			violations = append(violations, models.SLOViolation{
				Timestamp:   time.Now(),
				MetricType:  "latency_increase",
				Threshold:   200,
				ActualValue: latencyIncrease,
				Severity:    "critical",
				Description: fmt.Sprintf("Latency increased by %.0f%% from baseline", latencyIncrease),
			})
		}
	}

	return violations
}

func intPtr(i int) *int {
	return &i
}

package chaos

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strings"
	"time"

	"istio-fault-injection-engine/pkg/models"
)

type PrometheusCollector struct {
	config  models.PrometheusConfig
	client  *http.Client
}

func NewPrometheusCollector(config models.PrometheusConfig) *PrometheusCollector {
	return &PrometheusCollector{
		config: config,
		client: &http.Client{
			Timeout: time.Duration(config.QueryTimeoutSeconds) * time.Second,
		},
	}
}

type PrometheusResponse struct {
	Status string `json:"status"`
	Data   struct {
		ResultType string `json:"resultType"`
		Result     []struct {
			Metric map[string]string `json:"metric"`
			Values [][]interface{}   `json:"values"`
		} `json:"result"`
	} `json:"data"`
}

func (pc *PrometheusCollector) Query(ctx context.Context, query string) (*PrometheusResponse, error) {
	url := fmt.Sprintf("%s/api/v1/query_range?query=%s&start=%d&end=%d&step=%d",
		pc.config.Address,
		query,
		time.Now().AddDate(0, 0, -pc.config.LookbackDays).Unix(),
		time.Now().Unix(),
		pc.config.StepSeconds,
	)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := pc.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to execute query: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("prometheus query failed with status %d", resp.StatusCode)
	}

	var result PrometheusResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &result, nil
}

func (pc *PrometheusCollector) CollectServiceMetrics(ctx context.Context, namespace string) ([]*models.ServiceMetrics, error) {
	metricsMap := make(map[string]*models.ServiceMetrics)

	queries := []struct {
		name     string
		promQL   string
		process  func(*models.ServiceMetrics, []float64)
	}{
		{
			name: "latency_p50",
			promQL: fmt.Sprintf(`histogram_quantile(0.50, sum by(le, service) (rate(istio_request_duration_milliseconds_bucket{namespace="%s"}[5m])))`, namespace),
			process: func(sm *models.ServiceMetrics, values []float64) {
				sm.LatencyP50 = avg(values)
			},
		},
		{
			name: "latency_p95",
			promQL: fmt.Sprintf(`histogram_quantile(0.95, sum by(le, service) (rate(istio_request_duration_milliseconds_bucket{namespace="%s"}[5m])))`, namespace),
			process: func(sm *models.ServiceMetrics, values []float64) {
				sm.LatencyP95 = avg(values)
			},
		},
		{
			name: "latency_p99",
			promQL: fmt.Sprintf(`histogram_quantile(0.99, sum by(le, service) (rate(istio_request_duration_milliseconds_bucket{namespace="%s"}[5m])))`, namespace),
			process: func(sm *models.ServiceMetrics, values []float64) {
				sm.LatencyP99 = avg(values)
			},
		},
		{
			name: "error_rate",
			promQL: fmt.Sprintf(`sum by(service) (rate(istio_requests_total{namespace="%s", response_code=~"5.."}[5m])) / sum by(service) (rate(istio_requests_total{namespace="%s"}[5m])) * 100`, namespace, namespace),
			process: func(sm *models.ServiceMetrics, values []float64) {
				sm.ErrorRate = avg(values)
			},
		},
		{
			name: "traffic_qps",
			promQL: fmt.Sprintf(`sum by(service) (rate(istio_requests_total{namespace="%s"}[1m]))`, namespace),
			process: func(sm *models.ServiceMetrics, values []float64) {
				sm.TrafficQPS = avg(values)
			},
		},
		{
			name: "cpu_usage",
			promQL: fmt.Sprintf(`avg by(pod) (100 - (rate(node_cpu_seconds_total{mode="idle", namespace="%s"}[5m]) * 100))`, namespace),
			process: func(sm *models.ServiceMetrics, values []float64) {
				sm.CPUUsage = avg(values)
			},
		},
		{
			name: "memory_usage",
			promQL: fmt.Sprintf(`avg by(pod) (100 - (node_memory_MemAvailable_bytes{namespace="%s"} / node_memory_MemTotal_bytes{namespace="%s"}) * 100)`, namespace, namespace),
			process: func(sm *models.ServiceMetrics, values []float64) {
				sm.MemoryUsage = avg(values)
			},
		},
		{
			name: "saturation",
			promQL: fmt.Sprintf(`max by(service) (avg_over_time(istio_request_pending_requests{namespace="%s"}[5m]))`, namespace),
			process: func(sm *models.ServiceMetrics, values []float64) {
				sm.Saturation = avg(values)
			},
		},
	}

	for _, q := range queries {
		resp, err := pc.Query(ctx, q.promQL)
		if err != nil {
			continue
		}

		for _, result := range resp.Data.Result {
			serviceName := result.Metric["service"]
			if serviceName == "" {
				serviceName = result.Metric["pod"]
			}
			if serviceName == "" {
				continue
			}

			key := serviceName
			if _, exists := metricsMap[key]; !exists {
				metricsMap[key] = &models.ServiceMetrics{
					ServiceName: serviceName,
					Namespace:   namespace,
					Timestamp:   time.Now(),
				}
			}

			values := extractValues(result.Values)
			q.process(metricsMap[key], values)
		}
	}

	podCountResp, err := pc.Query(ctx, fmt.Sprintf(`count(kube_pod_status_phase{namespace="%s", phase="Running"}) by (pod)`, namespace))
	if err == nil {
		for _, result := range podCountResp.Data.Result {
			serviceName := result.Metric["pod"]
			if serviceName == "" {
				continue
			}
			key := serviceName
			if sm, exists := metricsMap[key]; exists {
				sm.PodCount = len(podCountResp.Data.Result)
			}
		}
	}

	var metricsList []*models.ServiceMetrics
	for _, m := range metricsMap {
		metricsList = append(metricsList, m)
	}

	return metricsList, nil
}

func (pc *PrometheusCollector) CollectServiceDependencies(ctx context.Context, namespace string) ([]*models.ServiceDependency, error) {
	query := fmt.Sprintf(`
		sum by(source_service, destination_service) (rate(istio_requests_total{
			namespace="%s",
			source_service!="unknown",
			destination_service!="unknown"
		}[5m]))
	`, namespace)

	resp, err := pc.Query(ctx, query)
	if err != nil {
		return nil, err
	}

	var dependencies []*models.ServiceDependency
	for _, result := range resp.Data.Result {
		source := result.Metric["source_service"]
		target := result.Metric["destination_service"]
		if source == "" || target == "" || source == target {
			continue
		}

		values := extractValues(result.Values)
		if len(values) == 0 {
			continue
		}

		dependencies = append(dependencies, &models.ServiceDependency{
			SourceService: source,
			TargetService: target,
			CallCount:     int64(sum(values)),
		})
	}

	return dependencies, nil
}

func (pc *PrometheusCollector) CollectHistoricalMetrics(ctx context.Context, namespace, service string) ([]*models.ServiceMetrics, error) {
	endTime := time.Now()
	startTime := endTime.AddDate(0, 0, -pc.config.LookbackDays)

	var historical []*models.ServiceMetrics
	current := startTime

	for current.Before(endTime) {
		metrics, err := pc.collectPointInTimeMetrics(ctx, namespace, service, current)
		if err == nil && metrics != nil {
			historical = append(historical, metrics)
		}
		current = current.Add(time.Duration(pc.config.StepSeconds) * time.Second)
	}

	return historical, nil
}

func (pc *PrometheusCollector) collectPointInTimeMetrics(ctx context.Context, namespace, service string, t time.Time) (*models.ServiceMetrics, error) {
	query := fmt.Sprintf(`sum by(service) (rate(istio_request_duration_milliseconds_sum{namespace="%s", service="%s"}[5m])) / sum by(service) (rate(istio_request_duration_milliseconds_count{namespace="%s", service="%s"}[5m]))`,
		namespace, service, namespace, service)

	resp, err := pc.Query(ctx, query)
	if err != nil {
		return nil, err
	}

	if len(resp.Data.Result) == 0 {
		return nil, fmt.Errorf("no data found")
	}

	values := extractValues(resp.Data.Result[0].Values)
	if len(values) == 0 {
		return nil, fmt.Errorf("no values found")
	}

	return &models.ServiceMetrics{
		ServiceName: service,
		Namespace:   namespace,
		LatencyP50:  avg(values),
		Timestamp:   t,
	}, nil
}

func (pc *PrometheusCollector) GetCurrentMetrics(ctx context.Context, namespace string, services []string) (map[string]*models.ServiceMetrics, error) {
	result := make(map[string]*models.ServiceMetrics)

	for _, service := range services {
		query := fmt.Sprintf(`
			{__name__=~"istio_request_duration_milliseconds_bucket|istio_requests_total",
			namespace="%s", service="%s"}[5m]
		`, namespace, service)

		resp, err := pc.Query(ctx, query)
		if err != nil {
			continue
		}

		var p50, p95, p99, errorRate, qps float64
		for _, r := range resp.Data.Result {
			values := extractValues(r.Values)
			if len(values) == 0 {
				continue
			}

			metricName := r.Metric["__name__"]
			if strings.Contains(metricName, "istio_request_duration") {
				p50 = percentiles(values, 0.5)
				p95 = percentiles(values, 0.95)
				p99 = percentiles(values, 0.99)
			} else if strings.Contains(metricName, "istio_requests_total") {
				qps = avg(values)
				if strings.Contains(r.Metric["response_code"], "5") {
					errorRate = avg(values) / qps * 100
				}
			}
		}

		result[service] = &models.ServiceMetrics{
			ServiceName: service,
			Namespace:   namespace,
			LatencyP50:  p50,
			LatencyP95:  p95,
			LatencyP99:  p99,
			ErrorRate:   errorRate,
			TrafficQPS:  qps,
			Timestamp:   time.Now(),
		}
	}

	return result, nil
}

func extractValues(rawValues [][]interface{}) []float64 {
	var values []float64
	for _, v := range rawValues {
		if len(v) >= 2 {
			if val, ok := v[1].(string); ok {
				var f float64
				fmt.Sscanf(val, "%f", &f)
				values = append(values, f)
			}
		}
	}
	return values
}

func avg(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	return sum(values) / float64(len(values))
}

func sum(values []float64) float64 {
	var total float64
	for _, v := range values {
		total += v
	}
	return total
}

func percentiles(values []float64, p float64) float64 {
	if len(values) == 0 {
		return 0
	}
	idx := int(math.Round(float64(len(values)) * p))
	if idx >= len(values) {
		idx = len(values) - 1
	}
	return values[idx]
}

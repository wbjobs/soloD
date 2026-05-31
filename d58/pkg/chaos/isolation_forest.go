package chaos

import (
	"math"
	"math/rand"
	"sort"
	"time"

	"istio-fault-injection-engine/pkg/models"
)

type IsolationForest struct {
	config      models.IsolationForestConfig
	trees       []*IsolationTree
	featureNames []string
}

type IsolationTree struct {
	root         *TreeNode
	sampleSize   int
	heightLimit  int
}

type TreeNode struct {
	splitFeature int
	splitValue   float64
	left         *TreeNode
	right        *TreeNode
	size         int
	isLeaf       bool
}

type AnomalyResult struct {
	WeakPoints []*models.WeakPoint
	Scores     map[string]float64
}

func NewIsolationForest(config models.IsolationForestConfig) *IsolationForest {
	return &IsolationForest{
		config: config,
		trees:  make([]*IsolationTree, config.NumTrees),
	}
}

func (f *IsolationForest) Train(metrics []*models.ServiceMetrics) {
	if len(metrics) < f.config.MinDataPoints {
		return
	}

	f.featureNames = []string{
		"latency_p50",
		"latency_p95",
		"latency_p99",
		"error_rate",
		"traffic_qps",
		"saturation",
		"cpu_usage",
		"memory_usage",
	}

	features := f.extractFeatures(metrics)
	maxSamples := f.config.MaxSamples
	if maxSamples > len(features) {
		maxSamples = len(features)
	}

	for i := 0; i < f.config.NumTrees; i++ {
		sample := f.randomSubsample(features, maxSamples)
		heightLimit := int(math.Ceil(math.Log2(float64(len(sample)))))
		f.trees[i] = f.buildTree(sample, 0, heightLimit)
	}
}

func (f *IsolationForest) extractFeatures(metrics []*models.ServiceMetrics) [][]float64 {
	features := make([][]float64, len(metrics))
	for i, m := range metrics {
		features[i] = []float64{
			m.LatencyP50,
			m.LatencyP95,
			m.LatencyP99,
			m.ErrorRate,
			m.TrafficQPS,
			m.Saturation,
			m.CPUUsage,
			m.MemoryUsage,
		}
	}
	return features
}

func (f *IsolationForest) randomSubsample(features [][]float64, size int) [][]float64 {
	if len(features) <= size {
		return features
	}

	indices := rand.Perm(len(features))
	sample := make([][]float64, size)
	for i := 0; i < size; i++ {
		sample[i] = features[indices[i]]
	}
	return sample
}

func (f *IsolationForest) buildTree(data [][]float64, currentHeight, heightLimit int) *IsolationTree {
	tree := &IsolationTree{
		sampleSize:  len(data),
		heightLimit: heightLimit,
	}
	tree.root = f.buildNode(data, currentHeight, heightLimit)
	return tree
}

func (f *IsolationForest) buildNode(data [][]float64, currentHeight, heightLimit int) *TreeNode {
	if currentHeight >= heightLimit || len(data) <= 1 {
		return &TreeNode{
			size:   len(data),
			isLeaf: true,
		}
	}

	numFeatures := len(data[0])
	feature := rand.Intn(numFeatures)

	minVal, maxVal := f.getMinMax(data, feature)
	if maxVal == minVal {
		return &TreeNode{
			size:   len(data),
			isLeaf: true,
		}
	}

	splitValue := minVal + rand.Float64()*(maxVal-minVal)

	var leftData, rightData [][]float64
	for _, row := range data {
		if row[feature] < splitValue {
			leftData = append(leftData, row)
		} else {
			rightData = append(rightData, row)
		}
	}

	return &TreeNode{
		splitFeature: feature,
		splitValue:   splitValue,
		left:         f.buildNode(leftData, currentHeight+1, heightLimit),
		right:        f.buildNode(rightData, currentHeight+1, heightLimit),
		size:         len(data),
		isLeaf:       false,
	}
}

func (f *IsolationForest) getMinMax(data [][]float64, feature int) (float64, float64) {
	minVal := math.Inf(1)
	maxVal := math.Inf(-1)
	for _, row := range data {
		if row[feature] < minVal {
			minVal = row[feature]
		}
		if row[feature] > maxVal {
			maxVal = row[feature]
		}
	}
	return minVal, maxVal
}

func (f *IsolationForest) AnomalyScore(sample []float64) float64 {
	if len(f.trees) == 0 {
		return 0.5
	}

	totalPathLength := 0.0
	for _, tree := range f.trees {
		totalPathLength += f.pathLength(sample, tree.root, 0)
	}

	avgPathLength := totalPathLength / float64(len(f.trees))
	cN := f.computeCn(float64(len(f.trees)))
	return math.Pow(2, -avgPathLength/cN)
}

func (f *IsolationForest) pathLength(sample []float64, node *TreeNode, currentDepth int) float64 {
	if node.isLeaf {
		if node.size <= 1 {
			return float64(currentDepth)
		}
		return float64(currentDepth) + f.computeCn(float64(node.size))
	}

	if sample[node.splitFeature] < node.splitValue {
		return f.pathLength(sample, node.left, currentDepth+1)
	}
	return f.pathLength(sample, node.right, currentDepth+1)
}

func (f *IsolationForest) computeCn(n float64) float64 {
	if n <= 2 {
		return 1
	}
	return 2*(math.Log(n-1)+0.5772156649) - 2*(n-1)/n
}

func (f *IsolationForest) DetectWeakPoints(metrics []*models.ServiceMetrics) *AnomalyResult {
	result := &AnomalyResult{
		Scores: make(map[string]float64),
	}

	if len(metrics) < f.config.MinDataPoints {
		return result
	}

	f.Train(metrics)

	anomalies := make(map[string]*struct {
		scores []float64
		metric *models.ServiceMetrics
		count  int
	})

	for _, m := range metrics {
		key := m.ServiceName
		if _, exists := anomalies[key]; !exists {
			anomalies[key] = &struct {
				scores []float64
				metric *models.ServiceMetrics
				count  int
			}{}
		}

		features := []float64{
			m.LatencyP50,
			m.LatencyP95,
			m.LatencyP99,
			m.ErrorRate,
			m.TrafficQPS,
			m.Saturation,
			m.CPUUsage,
			m.MemoryUsage,
		}

		score := f.AnomalyScore(features)
		anomalies[key].scores = append(anomalies[key].scores, score)
		anomalies[key].metric = m
		anomalies[key].count++
	}

	for key, data := range anomalies {
		avgScore := 0.0
		for _, s := range data.scores {
			avgScore += s
		}
		avgScore /= float64(len(data.scores))
		result.Scores[key] = avgScore

		if avgScore >= f.config.AnomalyThreshold {
			weakPoint := f.createWeakPoint(key, avgScore, data.metric)
			result.WeakPoints = append(result.WeakPoints, weakPoint)
		}
	}

	sort.Slice(result.WeakPoints, func(i, j int) bool {
		return result.WeakPoints[i].AnomalyScore > result.WeakPoints[j].AnomalyScore
	})

	return result
}

func (f *IsolationForest) createWeakPoint(serviceName string, score float64, metric *models.ServiceMetrics) *models.WeakPoint {
	wp := models.NewWeakPoint()
	wp.ServiceName = serviceName
	wp.AnomalyScore = score
	wp.HistoricalData = metric

	switch {
	case score >= 0.8:
		wp.Severity = "critical"
	case score >= 0.6:
		wp.Severity = "high"
	case score >= 0.4:
		wp.Severity = "medium"
	default:
		wp.Severity = "low"
	}

	metricType, desc := f.determineAnomalyType(metric)
	wp.MetricType = metricType
	wp.Description = desc

	return wp
}

func (f *IsolationForest) determineAnomalyType(metric *models.ServiceMetrics) (string, string) {
	type score struct {
		feature string
		value   float64
	}
	scores := []score{
		{"latency", (metric.LatencyP95 + metric.LatencyP99) / 2},
		{"error_rate", metric.ErrorRate},
		{"saturation", metric.Saturation},
		{"cpu", metric.CPUUsage},
		{"memory", metric.MemoryUsage},
		{"traffic", metric.TrafficQPS},
	}

	sort.Slice(scores, func(i, j int) bool {
		return scores[i].value > scores[j].value
	})

	descriptions := map[string]string{
		"latency":    "High latency detected - service may be under load or experiencing performance degradation",
		"error_rate": "Elevated error rate - service may be failing or receiving bad requests",
		"saturation": "High request saturation - service may be nearing capacity or experiencing queuing delays",
		"cpu":        "High CPU usage - service may be compute-bound or experiencing resource contention",
		"memory":     "High memory usage - potential memory leaks or resource constraints",
		"traffic":    "Traffic anomaly - unusual traffic patterns detected",
	}

	return scores[0].feature, descriptions[scores[0].feature]
}

func init() {
	rand.Seed(time.Now().UnixNano())
}

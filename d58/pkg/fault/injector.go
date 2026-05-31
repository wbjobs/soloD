package fault

import (
	"context"
	"math"
	"math/rand"
	"sync"
	"time"

	"istio-fault-injection-engine/pkg/matcher"
	"istio-fault-injection-engine/pkg/models"
	"istio-fault-injection-engine/pkg/storage"
)

type FaultInjector struct {
	store                *storage.EtcdStore
	rateLimiters         map[string]*RateLimiter
	connectionTracker    *ConnectionTracker
	timeoutReader        *DestinationRuleTimeoutReader
	mu                   sync.RWMutex
}

type RateLimiter struct {
	tokens     int64
	maxTokens  int64
	lastRefill time.Time
	refillRate float64
	mu         sync.Mutex
}

type ConnectionTracker struct {
	connections     map[string]*ConnectionInfo
	baselineCounts  map[string]int
	cleanupChan     chan struct{}
	mu              sync.RWMutex
}

type ConnectionInfo struct {
	ID        string
	CreatedAt time.Time
	RuleID    string
	SourceIP  string
	StreamID  uint64
}

type TimeoutResult struct {
	ShouldAbort   bool
	ActualDelay   time.Duration
	TimeoutMS     int64
	ThresholdMS   int64
}

type DestinationRuleTimeoutReader struct {
	cache     map[string]int64
	cacheTime map[string]time.Time
	cacheTTL  time.Duration
	mu        sync.RWMutex
}

func NewFaultInjector(store *storage.EtcdStore) *FaultInjector {
	fi := &FaultInjector{
		store:            store,
		rateLimiters:     make(map[string]*RateLimiter),
		connectionTracker: NewConnectionTracker(),
		timeoutReader:    NewDestinationRuleTimeoutReader(),
	}
	
	go fi.connectionTracker.StartCleanupRoutine(store)
	
	return fi
}

func NewConnectionTracker() *ConnectionTracker {
	return &ConnectionTracker{
		connections:    make(map[string]*ConnectionInfo),
		baselineCounts: make(map[string]int),
		cleanupChan:    make(chan struct{}),
	}
}

func NewDestinationRuleTimeoutReader() *DestinationRuleTimeoutReader {
	return &DestinationRuleTimeoutReader{
		cache:     make(map[string]int64),
		cacheTime: make(map[string]time.Time),
		cacheTTL:  5 * time.Minute,
	}
}

func (fi *FaultInjector) InjectDelayWithTimeoutCheck(
	delayConfig *models.DelayFault,
	timeoutConfig *models.TimeoutAwareConfig,
	rule *models.FaultRule,
	req *matcher.RequestContext,
) (*TimeoutResult, error) {
	delay, err := fi.InjectDelay(delayConfig)
	if err != nil {
		return nil, err
	}

	if !timeoutConfig.Enabled {
		return &TimeoutResult{
			ShouldAbort: false,
			ActualDelay: delay,
		}, nil
	}

	timeoutMS := fi.getEffectiveTimeout(timeoutConfig, rule)
	thresholdMS := int64(float64(timeoutMS) * timeoutConfig.TimeoutThresholdPct / 100.0)
	delayMS := int64(delay.Milliseconds())

	if delayMS > thresholdMS {
		actualDelay := time.Duration(thresholdMS) * time.Millisecond
		return &TimeoutResult{
			ShouldAbort: true,
			ActualDelay: actualDelay,
			TimeoutMS:   timeoutMS,
			ThresholdMS: thresholdMS,
		}, nil
	}

	return &TimeoutResult{
		ShouldAbort: false,
		ActualDelay: delay,
		TimeoutMS:   timeoutMS,
		ThresholdMS: thresholdMS,
	}, nil
}

func (fi *FaultInjector) getEffectiveTimeout(timeoutConfig *models.TimeoutAwareConfig, rule *models.FaultRule) int64 {
	if timeoutConfig.ReadFromDestinationRule {
		cachedTimeout, exists := fi.timeoutReader.GetTimeout(rule.Namespace, rule.Service)
		if exists {
			return cachedTimeout
		}
	}
	return timeoutConfig.DefaultTimeoutMS
}

func (fi *FaultInjector) InjectDelay(delayConfig *models.DelayFault) (time.Duration, error) {
	switch delayConfig.DelayType {
	case models.DelayTypeFixed:
		return fi.injectFixedDelay(delayConfig.Fixed)
	case models.DelayTypeNormal:
		return fi.injectNormalDelay(delayConfig.Normal)
	case models.DelayTypeJitter:
		return fi.injectJitterDelay(delayConfig.Jitter)
	default:
		return 0, nil
	}
}

func (fi *FaultInjector) injectFixedDelay(config *models.FixedDelay) (time.Duration, error) {
	if config == nil {
		return 0, nil
	}
	return time.Duration(config.DurationMS) * time.Millisecond, nil
}

func (fi *FaultInjector) injectNormalDelay(config *models.NormalDelay) (time.Duration, error) {
	if config == nil {
		return 0, nil
	}

	mean := float64(config.MeanMS)
	stdDev := float64(config.StdDevMS)
	sample := rand.NormFloat64()*stdDev + mean

	minMS := float64(config.MinMS)
	maxMS := float64(config.MaxMS)

	if minMS > 0 && sample < minMS {
		sample = minMS
	}
	if maxMS > 0 && sample > maxMS {
		sample = maxMS
	}
	if sample < 0 {
		sample = 0
	}

	return time.Duration(int64(math.Round(sample))) * time.Millisecond, nil
}

func (fi *FaultInjector) injectJitterDelay(config *models.JitterDelay) (time.Duration, error) {
	if config == nil {
		return 0, nil
	}

	rangeMS := config.MaxMS - config.MinMS
	if rangeMS <= 0 {
		return time.Duration(config.MinMS) * time.Millisecond, nil
	}

	jitter := rand.Int63n(rangeMS + 1)
	return time.Duration(config.MinMS+jitter) * time.Millisecond, nil
}

func (fi *FaultInjector) InjectAbort(abortConfig *models.AbortFault) (int, string, error) {
	if abortConfig == nil {
		return 0, "", nil
	}

	switch abortConfig.AbortType {
	case models.AbortTypeHTTPStatus:
		if abortConfig.HTTPStatus != nil {
			return *abortConfig.HTTPStatus, abortConfig.Message, nil
		}
		return 500, "Internal Server Error", nil
	case models.AbortTypeDNSFailure:
		return 503, "DNS Resolution Failed", nil
	default:
		return 500, "Internal Server Error", nil
	}
}

func (fi *FaultInjector) InjectTimeoutAbort() (int, string, error) {
	return 504, "Gateway Timeout - Fault Injection Protection", nil
}

func (fi *FaultInjector) InjectDisconnect(config *models.DisconnectFault) (string, error) {
	if config == nil {
		return "", nil
	}

	switch config.DisconnectType {
	case models.DisconnectTypeTCPReset:
		return "TCP_RESET", nil
	case models.DisconnectTypePoolExhausted:
		return "CONNECTION_POOL_EXHAUSTED", nil
	default:
		return "TCP_RESET", nil
	}
}

func (fi *FaultInjector) CheckRateLimit(ruleID string, config *models.RateLimitFault, key string) (bool, error) {
	if config == nil {
		return true, nil
	}

	limiterKey := ruleID + ":" + key

	fi.mu.RLock()
	limiter, exists := fi.rateLimiters[limiterKey]
	fi.mu.RUnlock()

	if !exists {
		fi.mu.Lock()
		limiter = &RateLimiter{
			tokens:     config.MaxRequests,
			maxTokens:  config.MaxRequests,
			lastRefill: time.Now(),
			refillRate: float64(config.MaxRequests) / float64(config.WindowSeconds),
		}
		fi.rateLimiters[limiterKey] = limiter
		fi.mu.Unlock()
	}

	limiter.mu.Lock()
	defer limiter.mu.Unlock()

	now := time.Now()
	elapsed := now.Sub(limiter.lastRefill).Seconds()
	newTokens := int64(elapsed * limiter.refillRate)

	if newTokens > 0 {
		limiter.tokens += newTokens
		if limiter.tokens > limiter.maxTokens {
			limiter.tokens = limiter.maxTokens
		}
		limiter.lastRefill = now
	}

	if limiter.tokens <= 0 {
		return false, nil
	}

	limiter.tokens--
	return true, nil
}

func (fi *FaultInjector) GetRateLimitKey(config *models.RateLimitFault, req *matcher.RequestContext) string {
	switch config.Dimension {
	case models.RateLimitByService:
		return "service"
	case models.RateLimitByPath:
		return "path:" + config.Path
	case models.RateLimitByUser:
		userID := ""
		if config.UserHeader != "" {
			userID = req.Headers[config.UserHeader]
		}
		return "user:" + userID
	default:
		return "service"
	}
}

func (ct *ConnectionTracker) StartCleanupRoutine(store *storage.EtcdStore) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			ct.checkAndCleanup()
		case <-ct.cleanupChan:
			return
		}
	}
}

func (ct *ConnectionTracker) checkAndCleanup() {
	ct.mu.Lock()
	defer ct.mu.Unlock()

	now := time.Now()
	var toCleanup []string

	for connID, conn := range ct.connections {
		age := now.Sub(conn.CreatedAt)
		if age > 5*time.Minute {
			toCleanup = append(toCleanup, connID)
		}
	}

	for _, connID := range toCleanup {
		delete(ct.connections, connID)
	}
}

func (ct *ConnectionTracker) TrackConnection(ruleID, sourceIP string, streamID uint64) string {
	ct.mu.Lock()
	defer ct.mu.Unlock()

	connID := generateConnectionID()
	ct.connections[connID] = &ConnectionInfo{
		ID:        connID,
		CreatedAt: time.Now(),
		RuleID:    ruleID,
		SourceIP:  sourceIP,
		StreamID:  streamID,
	}

	return connID
}

func (ct *ConnectionTracker) RemoveConnection(connID string) {
	ct.mu.Lock()
	defer ct.mu.Unlock()
	delete(ct.connections, connID)
}

func (ct *ConnectionTracker) CheckLeak(leakConfig *models.ConnectionLeakConfig) *LeakDetectionResult {
	if !leakConfig.Enabled {
		return &LeakDetectionResult{
			HasLeak: false,
		}
	}

	ct.mu.RLock()
	defer ct.mu.RUnlock()

	currentCount := len(ct.connections)
	serviceCounts := make(map[string]int)

	for _, conn := range ct.connections {
		serviceCounts[conn.RuleID]++
	}

	var leakingRules []string
	for ruleID, count := range serviceCounts {
		baseline, exists := ct.baselineCounts[ruleID]
		if !exists {
			ct.baselineCounts[ruleID] = count
			continue
		}

		growth := count - baseline
		if growth > leakConfig.MaxConnectionGrowth || count > leakConfig.LeakThreshold {
			leakingRules = append(leakingRules, ruleID)
		}
	}

	return &LeakDetectionResult{
		HasLeak:        len(leakingRules) > 0,
		LeakingRules:   leakingRules,
		CurrentCount:   currentCount,
		ServiceCounts:  serviceCounts,
	}
}

func (ct *ConnectionTracker) ForceCleanup(ruleIDs []string) int {
	ct.mu.Lock()
	defer ct.mu.Unlock()

	cleanupCount := 0
	for connID, conn := range ct.connections {
		for _, ruleID := range ruleIDs {
			if conn.RuleID == ruleID {
				delete(ct.connections, connID)
				cleanupCount++
				break
			}
		}
	}

	return cleanupCount
}

type LeakDetectionResult struct {
	HasLeak       bool
	LeakingRules  []string
	CurrentCount  int
	ServiceCounts map[string]int
}

func (dr *DestinationRuleTimeoutReader) GetTimeout(namespace, service string) (int64, bool) {
	dr.mu.RLock()
	defer dr.mu.RUnlock()

	key := namespace + "/" + service
	timeout, exists := dr.cache[key]
	if !exists {
		return 0, false
	}

	cacheTime, _ := dr.cacheTime[key]
	if time.Since(cacheTime) > dr.cacheTTL {
		return 0, false
	}

	return timeout, true
}

func (dr *DestinationRuleTimeoutReader) CacheTimeout(namespace, service string, timeoutMS int64) {
	dr.mu.Lock()
	defer dr.mu.Unlock()

	key := namespace + "/" + service
	dr.cache[key] = timeoutMS
	dr.cacheTime[key] = time.Now()
}

func (dr *DestinationRuleTimeoutReader) ClearCache() {
	dr.mu.Lock()
	defer dr.mu.Unlock()

	dr.cache = make(map[string]int64)
	dr.cacheTime = make(map[string]time.Time)
}

func generateConnectionID() string {
	return "conn-" + time.Now().Format("20060102150405.000000000")
}

func (fi *FaultInjector) Stop() {
	close(fi.connectionTracker.cleanupChan)
}

func init() {
	rand.Seed(time.Now().UnixNano())
}

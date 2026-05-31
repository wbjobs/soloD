package detector

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"deadlock-detector/config"
	"deadlock-detector/models"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sort"
	"time"
)

type WaitLevel string

const (
	WaitLevel1 WaitLevel = "LEVEL_1"
	WaitLevel2 WaitLevel = "LEVEL_2"
	WaitLevel3 WaitLevel = "LEVEL_3"
)

type StrategyManager struct {
	currentConfig *models.DeadlockStrategyConfig
}

func NewStrategyManager() *StrategyManager {
	sm := &StrategyManager{}
	sm.loadActiveConfig()
	return sm
}

func (sm *StrategyManager) loadActiveConfig() {
	var cfg models.DeadlockStrategyConfig
	if err := config.DB.Where("is_active = ?", true).First(&cfg).Error; err != nil {
		log.Printf("No active config found, creating default: %v", err)
		sm.createDefaultConfig()
		return
	}
	sm.currentConfig = &cfg
}

func (sm *StrategyManager) createDefaultConfig() {
	defaultConfig := &models.DeadlockStrategyConfig{
		ConfigName:            "default_strategy",
		IsActive:              true,
		Level1ThresholdSec:    30,
		Level1RetryDelaySec:    10,
		Level1MarkVictim:      false,
		Level2ThresholdSec:    120,
		Level2RetryDelaySec:  60,
		Level3ThresholdSec:    120,
		Level3RetryDelaySec:  300,
		Level3TriggerAlert:    true,
		PredictQueueThreshold: 5,
		PredictTrendWindow:    5,
		PredictTrendThreshold: 0.5,
		PredictEnabled:        true,
		Description:           "默认分级死锁处理策略",
	}
	if err := config.DB.Create(defaultConfig).Error; err != nil {
		log.Printf("Failed to create default config: %v", err)
	}
	sm.currentConfig = defaultConfig
}

func (sm *StrategyManager) GetConfig() *models.DeadlockStrategyConfig {
	if sm.currentConfig == nil {
		sm.loadActiveConfig()
	}
	return *sm.currentConfig
}

func (sm *StrategyManager) ReloadConfig() {
	sm.loadActiveConfig()
}

func (sm *StrategyManager) CalculateWaitLevel(waitDuration int64) WaitLevel {
	cfg := sm.GetConfig()
	waitSec := waitDuration / 1000

	if waitSec < int64(cfg.Level1ThresholdSec) {
		return WaitLevel1
	} else if waitSec < int64(cfg.Level2ThresholdSec) {
		return WaitLevel2
	}
	return WaitLevel3
}

func (sm *StrategyManager) ProcessDeadlockCycle(cycle *DeadlockCycle, taskWaitTimes map[string]int64) (string, error) {
	cfg := sm.GetConfig()

	avgWaitDuration := sm.calculateAverageWaitTime(cycle, taskWaitTimes)
	waitLevel := sm.CalculateWaitLevel(avgWaitDuration)

	var victim *TaskNode
	var retryDelay int

	switch waitLevel {
	case WaitLevel1:
		if !cfg.Level1MarkVictim {
			return "immediate_retry", sm.handleLevel1(cycle)
		}
		victim = sm.selectVictimByPriority(cycle)
		retryDelay = cfg.Level1RetryDelaySec

	case WaitLevel2:
		victim = sm.selectVictimByPriority(cycle)
		retryDelay = cfg.Level2RetryDelaySec

	case WaitLevel3:
		victim = sm.selectVictimByPriority(cycle)
		retryDelay = cfg.Level3RetryDelaySec
		if cfg.Level3TriggerAlert {
			sm.sendDingtalkAlert(cycle, avgWaitDuration, victim)
		}
	}

	if victim != nil {
		if err := sm.terminateAndRetry(victim, cycle, waitLevel, avgWaitDuration, taskWaitTimes[victim.TaskID], retryDelay); err != nil {
			return "", err
		}
	}

	return fmt.Sprintf("%s_victim_selected", waitLevel), nil
}

func (sm *StrategyManager) handleLevel1(cycle *DeadlockCycle) error {
	for _, task := range cycle.Tasks {
		sm.recordWaitTimeHistory(task, cycle)
	}
	return nil
}

func (sm *StrategyManager) calculateAverageWaitTime(cycle *DeadlockCycle, taskWaitTimes map[string]int64) int64 {
	if len(cycle.Tasks) == 0 {
		return 0
	}
	var total int64
	for _, task := range cycle.Tasks {
		total += taskWaitTimes[task.TaskID]
	}
	return total / int64(len(cycle.Tasks))
}

func (sm *StrategyManager) selectVictimByPriority(cycle *DeadlockCycle) *TaskNode {
	if len(cycle.Tasks) == 0 {
		return nil
	}

	victim := cycle.Tasks[0]
	minScore := calculateVictimScore(victim)

	for _, task := range cycle.Tasks[1:] {
		score := calculateVictimScore(task)
		if score < minScore {
			minScore = score
			victim = task
		}
	}
	return victim
}

func (sm *StrategyManager) terminateAndRetry(victim *TaskNode, cycle *DeadlockCycle,
	waitLevel WaitLevel, avgWaitDuration, victimWaitDuration int64, retryDelaySec int) error {
	now := time.Now()
	retryAt := now.Add(time.Duration(retryDelaySec) * time.Second)

	tx := config.DB.Begin()

	if err := tx.Model(&models.Task{}).Where("task_id = ?", victim.TaskID).
		Updates(map[string]interface{}{
			"status":       models.TaskStatusKilled,
			"completed_at": &now,
		}).Error; err != nil {
		tx.Rollback()
		return err
	}

	if err := tx.Where("task_id = ? AND is_locked = ?", victim.TaskID, true).
		Delete(&models.LockResource{}).Error; err != nil {
		tx.Rollback()
		return err
	}

	if err := tx.Where("task_id = ?", victim.TaskID).
		Delete(&models.WaitForLock{}).Error; err != nil {
		tx.Rollback()
		return err
	}

	if err := tx.Commit().Error; err != nil {
		return err
	}

	deadlockID := fmt.Sprintf("dl_%d", time.Now().UnixNano())
	taskIDs := make([]string, len(cycle.Tasks))
	for i, t := range cycle.Tasks {
		taskIDs[i] = t.TaskID
	}
	tasksJSON, _ := json.Marshal(taskIDs)
	resourcesJSON, _ := json.Marshal(cycle.Resources)

	audit := models.DeadlockAudit{
		DeadlockID:         deadlockID,
		DetectedAt:         time.Now(),
		InvolvedTasks:      string(tasksJSON),
		InvolvedResources:  string(resourcesJSON),
		CycleChain:         cycle.CycleStr,
		AvgWaitDuration:     avgWaitDuration,
		WaitLevel:           string(waitLevel),
		VictimTaskID:       victim.TaskID,
		VictimTaskName:     victim.Name,
		VictimWaitDuration: victimWaitDuration,
		Reason:             fmt.Sprintf("Level %s: priority=%d, duration=%dms, resources=%d bytes",
			waitLevel, victim.Priority, victim.RunDuration, victim.ResourceSize),
		ResolutionType:     fmt.Sprintf("%s_terminate_retry", waitLevel),
		AlertTriggered:   waitLevel == WaitLevel3 && sm.GetConfig().Level3TriggerAlert,
		ResolvedAt:       &now,
		RetryScheduled:   true,
		RetryDelaySeconds: retryDelaySec,
		RetryAt:          &retryAt,
	}

	if err := config.DB.Create(&audit).Error; err != nil {
		log.Printf("Failed to create deadlock audit: %v", err)
	}

	for _, task := range cycle.Tasks {
		sm.recordWaitTimeHistory(task, cycle)
	}

	if err := ScheduleRetry(victim.TaskID, retryAt); err != nil {
		log.Printf("Failed to schedule retry for task %s: %v", victim.TaskID, err)
	}

	log.Printf("Deadlock resolved [%s]: terminated task %s, retry scheduled at %v",
		waitLevel, victim.TaskID, retryAt)
	return nil
}

func (sm *StrategyManager) recordWaitTimeHistory(task *TaskNode, cycle *DeadlockCycle) {
	var queueLength := len(cycle.Tasks)
	history := models.WaitTimeHistory{
		ResourceID:  "",
		TaskID:      task.TaskID,
		WaitDuration: task.RunDuration,
		QueueLength: queueLength,
		IsDeadlock:  true,
	}
	config.DB.Create(&history)
}

func (sm *StrategyManager) sendDingtalkAlert(cycle *DeadlockCycle, avgWaitDuration int64, victim *TaskNode) {
	cfg := sm.GetConfig()
	if cfg.DingtalkWebhook == "" {
		log.Println("Dingtalk webhook not configured")
		return
	}

	title := fmt.Sprintf("死锁告警 - Level 3")
	content := fmt.Sprintf("检测到高级别死锁！\n\n死锁ID: %s\n涉及任务数: %d\n平均等待时间: %d ms\n循环链路: %s\n\n牺牲任务: %s (%s)\n优先级: %d\n运行时长: %d ms\n\n请及时关注系统状态！",
		fmt.Sprintf("dl_%d", time.Now().UnixNano()),
		len(cycle.Tasks),
		avgWaitDuration,
		cycle.CycleStr,
		victim.Name,
		victim.TaskID,
		victim.Priority,
		victim.RunDuration,
	)

	if err := SendDingtalkMessage(cfg.DingtalkWebhook, cfg.DingtalkSecret, title, content); err != nil {
		log.Printf("Failed to send dingtalk alert: %v", err)
	}
}

func SendDingtalkMessage(webhook, secret, title, content string) error {
	timestamp := time.Now().UnixNano() / int64(time.Millisecond)
	sign := generateDingtalkSign(timestamp, secret)

	url := fmt.Sprintf("%s&timestamp=%d&sign=%s", webhook, timestamp, sign)

	msg := map[string]interface{}{
		"msgtype": "markdown",
		"markdown": map[string]interface{}{
			"title": title,
			"text":  content,
		},
		"at": map[string]interface{}{
			"isAtAll": true,
		},
	}

	jsonData, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	resp, err := http.Post(url, "application/json", bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("dingtalk api returned status: %d", resp.StatusCode)
	}

	log.Println("Dingtalk alert sent successfully")
	return nil
}

func generateDingtalkSign(timestamp int64, secret string) string {
	stringToSign := fmt.Sprintf("%d\n%s", timestamp, secret)
	h := hmac.New(sha256.New, []byte(secret))
	h.Write([]byte(stringToSign))
	signData := h.Sum(nil)
	return base64.StdEncoding.EncodeToString(signData)
}

type DeadlockPredictor struct {
	strategyManager *StrategyManager
}

func NewDeadlockPredictor(sm *StrategyManager) *DeadlockPredictor {
	return &DeadlockPredictor{
		strategyManager: sm,
	}
}

func (p *DeadlockPredictor) RunPrediction() error {
	cfg := p.strategyManager.GetConfig()
	if !cfg.PredictEnabled {
		return nil
	}

	var waitQueues map[string][]models.WaitForLock
	config.DB.Find(&waitQueues)

	resourceQueues := make(map[string][]models.WaitForLock)
	for _, wf := range waitQueues {
		resourceQueues[wf.ResourceID] = append(resourceQueues[wf.ResourceID], wf)
	}

	for resourceID, queue := range resourceQueues {
		queueLength := len(queue)
		if queueLength >= cfg.PredictQueueThreshold {
			riskLevel, trendSlope, avgWait := p.analyzeWaitTrend(resourceID, cfg.PredictTrendWindow)

			if trendSlope > cfg.PredictTrendThreshold {
				p.handleHighRiskResource(resourceID, queueLength, avgWait, trendSlope, riskLevel)
			}
		}
	}

	return nil
}

func (p *DeadlockPredictor) analyzeWaitTrend(resourceID string, windowSize int) (string, float64, float64) {
	var histories []models.WaitTimeHistory
	config.DB.Where("resource_id = ?", resourceID).
		Order("created_at DESC").
		Limit(windowSize).
		Find(&histories)

	if len(histories) < 2 {
		return "LOW", 0, 0
	}

	var waitTimes []float64
	for _, h := range histories {
		waitTimes = append(waitTimes, float64(h.WaitDuration))
	}

	slope := p.calculateLinearRegressionSlope(waitTimes)

	avgWait := 0.0
	for _, wt := range waitTimes {
		avgWait += wt
	}
	avgWait /= float64(len(waitTimes))

	riskLevel := "LOW"
	if slope > 0.3 {
		riskLevel = "MEDIUM"
	}
	if slope > 0.7 {
		riskLevel = "HIGH"
	}

	return riskLevel, slope, avgWait
}

func (p *DeadlockPredictor) calculateLinearRegressionSlope(values []float64) float64 {
	n := len(values)
	if n < 2 {
		return 0
	}

	var sumX, sumY, sumXY, sumX2 float64
	for i, y := range values {
		x := float64(i)
		sumX += x
		sumY += y
		sumXY += x * y
		sumX2 += x * x
	}

	slope := (float64(n)*sumXY - sumX*sumY) / (float64(n)*sumX2 - sumX*sumX)
	return slope
}

func (p *DeadlockPredictor) handleHighRiskResource(resourceID string, queueLength int, avgWait, trendSlope float64, riskLevel string) {
	log.Printf("死锁预测: 资源 %s 高风险 - 队列长度=%d, 平均等待=%0.fms, 趋势斜率=%.2f, 风险等级=%s",
		resourceID, queueLength, avgWait, trendSlope, riskLevel)

	actionTaken := p.adjustTaskPriorities(resourceID)

	predictionID := fmt.Sprintf("pred_%d", time.Now().UnixNano())
	predictionEvent := &models.PredictionEvent{
		PredictionID: predictionID,
		ResourceID:   resourceID,
		PredictedAt:  time.Now(),
		RiskLevel:    riskLevel,
		QueueLength:  queueLength,
		AvgWaitTime:  avgWait,
		TrendSlope:   trendSlope,
		ActionTaken:  actionTaken,
	}
	config.DB.Create(predictionEvent)
}

func (p *DeadlockPredictor) adjustTaskPriorities(resourceID string) string {
	var waitingTasks []models.WaitForLock
	config.DB.Where("resource_id = ?", resourceID).Find(&waitingTasks)

	if len(waitingTasks) == 0 {
		return "no_tasks_waiting"
	}

	taskIDs := make([]string, len(waitingTasks))
	for i, wf := range waitingTasks {
		taskIDs[i] = wf.TaskID
	}

	var tasks []models.Task
	config.DB.Where("task_id IN ?", taskIDs).Find(&tasks)

	sort.Slice(tasks, func(i, j int) bool {
		return tasks[i].Priority > tasks[j].Priority
	})

	adjustedCount := 0
	for i := range tasks {
		if i < len(tasks)/2 {
			tasks[i].Priority++
			adjustedCount++
		}
	}

	for _, task := range tasks {
		config.DB.Model(&task).Update("priority", task.Priority)
	}

	return fmt.Sprintf("adjusted %d task priorities", adjustedCount)
}

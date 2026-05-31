package detector

import (
	"deadlock-detector/config"
	"deadlock-detector/models"
	"encoding/json"
	"log"
	"time"

	"github.com/go-redis/redis/v8"
	"github.com/robfig/cron/v3"
)

type DeadlockDetector struct {
	taskGraph       *TaskGraph
	strategyManager *StrategyManager
	predictor       *DeadlockPredictor
	cron            *cron.Cron
}

func NewDeadlockDetector() *DeadlockDetector {
	sm := NewStrategyManager()
	return &DeadlockDetector{
		taskGraph:       NewTaskGraph(),
		strategyManager: sm,
		predictor:       NewDeadlockPredictor(sm),
		cron:            cron.New(),
	}
}

func (d *DeadlockDetector) Start() error {
	_, err := d.cron.AddFunc("@every 30s", func() {
		d.RunDetection()
	})
	if err != nil {
		return err
	}

	_, err = d.cron.AddFunc("@every 1m", func() {
		d.ProcessRetryTasks()
	})
	if err != nil {
		return err
	}

	_, err = d.cron.AddFunc("@every 2m", func() {
		d.predictor.RunPrediction()
	})
	if err != nil {
		return err
	}

	d.cron.Start()
	log.Println("Deadlock detector started, checking every 30 seconds")
	return nil
}

func (d *DeadlockDetector) Stop() {
	d.cron.Stop()
	log.Println("Deadlock detector stopped")
}

func (d *DeadlockDetector) RunDetection() {
	log.Println("Starting deadlock detection cycle...")

	if err := d.taskGraph.BuildFromDB(); err != nil {
		log.Printf("Failed to build task graph: %v", err)
		return
	}

	cycles, err := d.taskGraph.DetectDeadlocks()
	if err != nil {
		log.Printf("Failed to detect deadlocks: %v", err)
		return
	}

	if len(cycles) == 0 {
		log.Println("No deadlocks detected")
		return
	}

	log.Printf("Detected %d deadlock cycles!", len(cycles))

	taskWaitTimes := d.collectTaskWaitTimes(cycles)

	for i, cycle := range cycles {
		log.Printf("Deadlock cycle %d: %s", i+1, cycle.CycleStr)

		result, err := d.strategyManager.ProcessDeadlockCycle(cycle, taskWaitTimes)
		if err != nil {
			log.Printf("Failed to process deadlock cycle %d: %v", i+1, err)
			continue
		}
		log.Printf("Cycle %d processed with result: %s", i+1, result)
	}
}

func (d *DeadlockDetector) collectTaskWaitTimes(cycles []*DeadlockCycle) map[string]int64 {
	waitTimes := make(map[string]int64)

	for _, cycle := range cycles {
		for _, task := range cycle.Tasks {
			var wf models.WaitForLock
			if err := config.DB.Where("task_id = ?", task.TaskID).First(&wf).Error; err == nil {
				waitDuration := time.Since(wf.WaitingAt).Milliseconds()
				waitTimes[task.TaskID] = waitDuration
			} else {
				waitTimes[task.TaskID] = task.RunDuration
			}
		}
	}

	return waitTimes
}

func (d *DeadlockDetector) ProcessRetryTasks() {
	now := time.Now().Unix()

	tasks, err := config.RedisClient.ZRangeByScore(config.Ctx, config.RetryDelayKey, &redis.ZRangeBy{
		Min: "0",
		Max: string(now),
	}).Result()
	if err != nil {
		log.Printf("Failed to fetch retry tasks: %v", err)
		return
	}

	for _, taskStr := range tasks {
		var taskData map[string]interface{}
		if err := json.Unmarshal([]byte(taskStr), &taskData); err != nil {
			log.Printf("Failed to unmarshal retry task: %v", err)
			continue
		}

		taskID := taskData["task_id"].(string)
		log.Printf("Processing retry for task: %s", taskID)

		taskMap := map[string]interface{}{
			"task_id":   taskID,
			"retry":     true,
			"timestamp": time.Now().Unix(),
		}

		_, err = config.RedisClient.XAdd(config.Ctx, &redis.XAddArgs{
			Stream: config.TaskStream,
			Values: taskMap,
		}).Result()
		if err != nil {
			log.Printf("Failed to re-enqueue task %s: %v", taskID, err)
			continue
		}

		config.RedisClient.ZRem(config.Ctx, config.RetryDelayKey, taskStr)
		log.Printf("Task %s successfully re-enqueued", taskID)
	}
}

func (d *DeadlockDetector) GetStrategyManager() *StrategyManager {
	return d.strategyManager
}

func (d *DeadlockDetector) TriggerPrediction() {
	d.predictor.RunPrediction()
}

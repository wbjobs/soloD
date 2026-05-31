package detector

import (
	"deadlock-detector/internal/database"
	"deadlock-detector/internal/graph"
	"deadlock-detector/internal/redis"
	"fmt"
	"log"
	"strconv"
	"strings"
	"time"
)

type DeadlockDetector struct {
	graph *graph.DependencyGraph
}

type DeadlockCycle struct {
	TaskIDs   []uint
	TaskNames []string
}

type SacrificeResult struct {
	TaskID   uint
	TaskName string
	Reason   string
}

func NewDeadlockDetector() *DeadlockDetector {
	return &DeadlockDetector{
		graph: graph.NewDependencyGraph(),
	}
}

func (d *DeadlockDetector) Detect() ([]DeadlockCycle, error) {
	d.graph = graph.NewDependencyGraph()
	
	waitGraph, err := database.BuildWaitForGraph()
	if err != nil {
		return nil, fmt.Errorf("failed to build wait-for graph: %w", err)
	}

	taskIDs, err := database.GetRunningTaskIDs()
	if err != nil {
		return nil, fmt.Errorf("failed to get running tasks: %w", err)
	}

	for _, taskID := range taskIDs {
		task, err := database.GetTaskByID(taskID)
		if err != nil {
			continue
		}
		d.graph.AddTask(task)

		heldLocks, err := database.GetHeldLocksByTaskID(taskID)
		if err == nil {
			for _, lock := range heldLocks {
				d.graph.AddResourceHold(taskID, lock.Resource)
			}
		}
	}

	for waitTaskID, waitingTaskIDs := range waitGraph {
		for _, taskID := range waitingTaskIDs {
			d.graph.AddDependency(taskID, waitTaskID)
		}
	}

	if d.graph.HasCycle() {
		cycles := d.graph.GetCycle()
		deadlockCycles := make([]DeadlockCycle, len(cycles))
		
		for i, cycle := range cycles {
			taskNames := make([]string, len(cycle))
			for j, taskID := range cycle {
				if node, exists := d.graph.Nodes[taskID]; exists {
					taskNames[j] = node.TaskName
				}
			}
			deadlockCycles[i] = DeadlockCycle{
				TaskIDs:   cycle,
				TaskNames: taskNames,
			}
		}
		
		return deadlockCycles, nil
	}

	return nil, nil
}

func (d *DeadlockDetector) SelectSacrifice(cycle []uint) (*SacrificeResult, error) {
	if len(cycle) == 0 {
		return nil, fmt.Errorf("empty cycle")
	}

	type taskScore struct {
		taskID   uint
		taskName string
		score    float64
		reasons  []string
	}

	scores := make([]taskScore, 0, len(cycle))

	for _, taskID := range cycle {
		task, err := database.GetTaskWithLocks(taskID)
		if err != nil {
			continue
		}

		var score float64 = 0
		var reasons []string

		score += float64(task.Priority) * 100
		if task.Priority == 0 {
			reasons = append(reasons, "lowest priority")
		}

		runtime := time.Since(*task.StartTime).Seconds()
		score += float64(runtime) * 0.1
		if runtime > 0 {
			reasons = append(reasons, fmt.Sprintf("running for %.0f seconds", runtime))
		}

		heldCount := len(task.ResourceLocks)
		score += float64(heldCount) * 10
		reasons = append(reasons, fmt.Sprintf("holds %d resources", heldCount))

		retryScore := float64(task.RetryCount) * 50
		score += retryScore

		scores = append(scores, taskScore{
			taskID:   taskID,
			taskName: task.Name,
			score:    score,
			reasons:  reasons,
		})
	}

	if len(scores) == 0 {
		return nil, fmt.Errorf("no valid tasks in cycle")
	}

	minScore := scores[0]
	for _, s := range scores[1:] {
		if s.score < minScore.score {
			minScore = s
		}
	}

	return &SacrificeResult{
		TaskID:   minScore.taskID,
		TaskName: minScore.taskName,
		Reason:   strings.Join(minScore.reasons, "; "),
	}, nil
}

func (d *DeadlockDetector) ResolveDeadlock(cycle DeadlockCycle) (*SacrificeResult, error) {
	sacrifice, err := d.SelectSacrifice(cycle.TaskIDs)
	if err != nil {
		return nil, fmt.Errorf("failed to select sacrifice: %w", err)
	}

	task, err := database.GetTaskByID(sacrifice.TaskID)
	if err != nil {
		return nil, fmt.Errorf("failed to get task: %w", err)
	}

	err = database.RollbackTask(task)
	if err != nil {
		return nil, fmt.Errorf("failed to rollback task: %w", err)
	}

	log.Printf("Task %d (%s) has been rolled back as deadlock sacrifice", sacrifice.TaskID, sacrifice.TaskName)

	task.Status = database.TaskStatusPending
	task.RetryCount++
	err = database.UpdateTask(task)
	if err != nil {
		log.Printf("Warning: failed to update task status: %v", err)
	}

	if task.RetryCount <= task.MaxRetries {
		err = redis.EnqueueTaskWithDelay(task, 5*time.Minute)
		if err != nil {
			log.Printf("Warning: failed to re-enqueue task: %v", err)
		}
		log.Printf("Task %d will be retried after 5 minutes (attempt %d/%d)", 
			task.ID, task.RetryCount, task.MaxRetries)
	}

	event := &database.DeadlockEvent{
		DetectedAt:  time.Now(),
		CycleLength: len(cycle.TaskIDs),
		TaskIDs:     joinUintIDs(cycle.TaskIDs),
		TaskNames:   strings.Join(cycle.TaskNames, ", "),
		SacrificeID: sacrifice.TaskID,
		SacrificeName: sacrifice.TaskName,
		Reason:      sacrifice.Reason,
		CreatedAt:   time.Now(),
	}
	
	err = database.CreateDeadlockEvent(event)
	if err != nil {
		log.Printf("Warning: failed to create deadlock event: %v", err)
	}

	return sacrifice, nil
}

func (d *DeadlockDetector) RunDetection() (int, error) {
	cycles, err := d.Detect()
	if err != nil {
		return 0, err
	}

	if len(cycles) == 0 {
		log.Println("No deadlocks detected")
		return 0, nil
	}

	log.Printf("Detected %d deadlock cycles", len(cycles))

	for i, cycle := range cycles {
		log.Printf("Cycle %d: Tasks %v (Names: %v)", 
			i+1, cycle.TaskIDs, cycle.TaskNames)
		
		sacrifice, err := d.ResolveDeadlock(cycle)
		if err != nil {
			log.Printf("Failed to resolve deadlock in cycle %d: %v", i+1, err)
			continue
		}
		
		log.Printf("Resolved deadlock by sacrificing Task %d (%s), reason: %s",
			sacrifice.TaskID, sacrifice.TaskName, sacrifice.Reason)
	}

	return len(cycles), nil
}

func joinUintIDs(ids []uint) string {
	strIDs := make([]string, len(ids))
	for i, id := range ids {
		strIDs[i] = strconv.FormatUint(uint64(id), 10)
	}
	return strings.Join(strIDs, ", ")
}

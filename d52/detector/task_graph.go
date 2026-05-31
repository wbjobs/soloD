package detector

import (
	"deadlock-detector/config"
	"deadlock-detector/models"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/go-redis/redis/v8"
)

type VisitState int

const (
	Unvisited VisitState = iota
	Visiting
	Visited
)

type TaskNode struct {
	TaskID       string
	Name         string
	Priority     int
	RunDuration  int64
	ResourceSize int64
	HeldLocks    []string
	WaitingFor   []string
}

type DeadlockCycle struct {
	Tasks     []*TaskNode
	Resources []string
	CycleStr  string
}

type TaskGraph struct {
	nodes map[string]*TaskNode
	edges map[string][]string
	mu    sync.RWMutex
}

func NewTaskGraph() *TaskGraph {
	return &TaskGraph{
		nodes: make(map[string]*TaskNode),
		edges: make(map[string][]string),
	}
}

func (tg *TaskGraph) BuildFromDB() error {
	tg.mu.Lock()
	defer tg.mu.Unlock()

	tg.nodes = make(map[string]*TaskNode)
	tg.edges = make(map[string][]string)

	var runningTasks []models.Task
	if err := config.DB.Where("status = ?", models.TaskStatusRunning).Find(&runningTasks).Error; err != nil {
		return fmt.Errorf("failed to fetch running tasks: %v", err)
	}

	for _, task := range runningTasks {
		node := &TaskNode{
			TaskID:      task.TaskID,
			Name:        task.Name,
			Priority:    task.Priority,
			RunDuration: task.RunDuration,
			ResourceSize: task.ResourceSize,
		}

		var heldLocks []models.LockResource
		if err := config.DB.Where("task_id = ? AND is_locked = ?", task.TaskID, true).Find(&heldLocks).Error; err == nil {
			for _, lock := range heldLocks {
				node.HeldLocks = append(node.HeldLocks, lock.ResourceID)
			}
		}

		var waitingLocks []models.WaitForLock
		if err := config.DB.Where("task_id = ?", task.TaskID).Find(&waitingLocks).Error; err == nil {
			for _, wait := range waitingLocks {
				node.WaitingFor = append(node.WaitingFor, wait.ResourceID)
			}
		}

		tg.nodes[task.TaskID] = node
	}

	for _, task := range runningTasks {
		for _, resourceID := range tg.nodes[task.TaskID].WaitingFor {
			var lockResource models.LockResource
			if err := config.DB.Where("resource_id = ? AND is_locked = ?", resourceID, true).First(&lockResource).Error; err == nil {
				if lockResource.TaskID != "" && lockResource.TaskID != task.TaskID {
					tg.edges[task.TaskID] = append(tg.edges[task.TaskID], lockResource.TaskID)
				}
			}
		}
	}

	return nil
}

func (tg *TaskGraph) DetectDeadlocks() ([]*DeadlockCycle, error) {
	tg.mu.RLock()
	defer tg.mu.RUnlock()

	state := make(map[string]VisitState)
	path := make([]string, 0)
	var cycles []*DeadlockCycle

	for taskID := range tg.nodes {
		if state[taskID] == Unvisited {
			tg.dfs(taskID, state, path, &cycles)
		}
	}

	return cycles, nil
}

func (tg *TaskGraph) dfs(taskID string, state map[string]VisitState, path []string, cycles *[]*DeadlockCycle) {
	state[taskID] = Visiting
	path = append(path, taskID)

	for _, neighbor := range tg.edges[taskID] {
		if state[neighbor] == Unvisited {
			tg.dfs(neighbor, state, path, cycles)
		} else if state[neighbor] == Visiting {
			cycleStart := -1
			for i, node := range path {
				if node == neighbor {
					cycleStart = i
					break
				}
			}
			if cycleStart != -1 {
				cycleTasks := make([]*TaskNode, 0)
				resourceSet := make(map[string]bool)
				for i := cycleStart; i < len(path); i++ {
					node := tg.nodes[path[i]]
					cycleTasks = append(cycleTasks, node)
					for _, r := range node.HeldLocks {
						resourceSet[r] = true
					}
					for _, r := range node.WaitingFor {
						resourceSet[r] = true
					}
				}

				resources := make([]string, 0, len(resourceSet))
				for r := range resourceSet {
					resources = append(resources, r)
				}

				cycleStr := strings.Join(path[cycleStart:], " -> ")
				*cycles = append(*cycles, &DeadlockCycle{
					Tasks:     cycleTasks,
					Resources: resources,
					CycleStr:  cycleStr,
				})
			}
		}
	}

	path = path[:len(path)-1]
	state[taskID] = Visited
}

func (tg *TaskGraph) AddNode(taskID, name string, priority int, runDuration int64, resourceSize int64) {
	tg.mu.Lock()
	defer tg.mu.Unlock()

	tg.nodes[taskID] = &TaskNode{
		TaskID:       taskID,
		Name:         name,
		Priority:     priority,
		RunDuration:  runDuration,
		ResourceSize: resourceSize,
	}
}

func (tg *TaskGraph) AddEdge(from, to string) {
	tg.mu.Lock()
	defer tg.mu.Unlock()

	tg.edges[from] = append(tg.edges[from], to)
}

func (tg *TaskGraph) SetNodeLocks(taskID string, held, waiting []string) {
	tg.mu.Lock()
	defer tg.mu.Unlock()

	if node, exists := tg.nodes[taskID]; exists {
		node.HeldLocks = held
		node.WaitingFor = waiting
	}
}

func (tg *TaskGraph) SelectVictim(cycle *DeadlockCycle) *TaskNode {
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

func calculateVictimScore(task *TaskNode) float64 {
	priorityWeight := 10.0
	durationWeight := 5.0
	resourceWeight := 3.0

	score := float64(task.Priority)*priorityWeight +
		float64(task.RunDuration)*durationWeight/1000.0 +
		float64(task.ResourceSize)*resourceWeight/1024.0/1024.0

	return score
}

func (tg *TaskGraph) TerminateAndRollback(victim *TaskNode, cycle *DeadlockCycle) error {
	tx := config.DB.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	if err := tx.Error; err != nil {
		return err
	}

	now := time.Now()
	if err := tx.Model(&models.Task{}).Where("task_id = ?", victim.TaskID).
		Updates(map[string]interface{}{
			"status":      models.TaskStatusKilled,
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

	retryAt := time.Now().Add(5 * time.Minute)
	audit := models.DeadlockAudit{
		DeadlockID:        deadlockID,
		DetectedAt:        time.Now(),
		InvolvedTasks:     string(tasksJSON),
		InvolvedResources: string(resourcesJSON),
		CycleChain:        cycle.CycleStr,
		VictimTaskID:      victim.TaskID,
		VictimTaskName:    victim.Name,
		Reason:            fmt.Sprintf("Selected as victim based on priority=%d, duration=%dms, resources=%d bytes",
			victim.Priority, victim.RunDuration, victim.ResourceSize),
		ResolutionType:    "terminate_rollback",
		RetryScheduled:    true,
		RetryAt:           &retryAt,
	}

	if err := config.DB.Create(&audit).Error; err != nil {
		log.Printf("Failed to create deadlock audit: %v", err)
	}

	if err := ScheduleRetry(victim.TaskID, retryAt); err != nil {
		log.Printf("Failed to schedule retry for task %s: %v", victim.TaskID, err)
	}

	log.Printf("Deadlock resolved: terminated task %s, retry scheduled at %v", victim.TaskID, retryAt)
	return nil
}

func ScheduleRetry(taskID string, retryAt time.Time) error {
	taskData := map[string]interface{}{
		"task_id":   taskID,
		"retry_at":  retryAt.Unix(),
		"scheduled": true,
	}

	jsonData, err := json.Marshal(taskData)
	if err != nil {
		return err
	}

	return config.RedisClient.ZAdd(config.Ctx, config.RetryDelayKey, &redis.Z{
		Score:  float64(retryAt.Unix()),
		Member: jsonData,
	}).Err()
}

package main

import (
	"context"
	"deadlock-detector/config"
	"deadlock-detector/models"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-redis/redis/v8"
)

type Worker struct {
	workerID string
	stream   string
	group    string
}

func NewWorker(workerID string) *Worker {
	return &Worker{
		workerID: workerID,
		stream:   config.TaskStream,
		group:    config.DeadlockGroup,
	}
}

func (w *Worker) Start(ctx context.Context) error {
	err := config.RedisClient.XGroupCreateMkStream(ctx, w.stream, w.group, "$").Err()
	if err != nil && err.Error() != "BUSYGROUP Consumer Group name already exists" {
		return fmt.Errorf("failed to create consumer group: %v", err)
	}

	log.Printf("Worker %s started, listening to stream %s", w.workerID, w.stream)

	for {
		select {
		case <-ctx.Done():
			log.Printf("Worker %s stopping", w.workerID)
			return nil
		default:
			streams, err := config.RedisClient.XReadGroup(ctx, &redis.XReadGroupArgs{
				Group:    w.group,
				Consumer: w.workerID,
				Streams:  []string{w.stream, ">"},
				Count:    10,
				Block:    5 * time.Second,
			}).Result()

			if err != nil {
				if err == context.Canceled {
					return nil
				}
				log.Printf("Error reading from stream: %v", err)
				time.Sleep(1 * time.Second)
				continue
			}

			for _, stream := range streams {
				for _, msg := range stream.Messages {
					w.ProcessMessage(ctx, msg)
					config.RedisClient.XAck(ctx, w.stream, w.group, msg.ID)
				}
			}
		}
	}
}

func (w *Worker) ProcessMessage(ctx context.Context, msg redis.XMessage) {
	taskID, ok := msg.Values["task_id"].(string)
	if !ok {
		log.Printf("Invalid message format: missing task_id")
		return
	}

	log.Printf("Worker %s processing task %s", w.workerID, taskID)

	if err := w.StartTask(taskID); err != nil {
		log.Printf("Failed to start task %s: %v", taskID, err)
		return
	}

	go w.SimulateTaskWork(ctx, taskID, msg.Values)
}

func (w *Worker) StartTask(taskID string) error {
	now := time.Now()
	return config.DB.Model(&models.Task{}).
		Where("task_id = ?", taskID).
		Updates(map[string]interface{}{
			"status":   models.TaskStatusRunning,
			"worker_id": w.workerID,
			"started_at": &now,
		}).Error
}

func (w *Worker) SimulateTaskWork(ctx context.Context, taskID string, values map[string]interface{}) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("Task %s panicked: %v", taskID, r)
			w.MarkTaskFailed(taskID, fmt.Sprintf("panic: %v", r))
		}
	}()

	resources := []string{"resource_1", "resource_2", "resource_3"}
	acquiredResources := make([]string, 0)

	for _, res := range resources {
		select {
		case <-ctx.Done():
			w.ReleaseResources(taskID, acquiredResources)
			return
		default:
			if err := w.AcquireResource(taskID, res); err != nil {
				log.Printf("Task %s waiting for resource %s", taskID, res)
				w.AddWaitForLock(taskID, res)

				select {
				case <-time.After(10 * time.Second):
					log.Printf("Task %s timeout waiting for %s", taskID, res)
					w.ReleaseResources(taskID, acquiredResources)
					w.RemoveWaitForLock(taskID, res)
					w.MarkTaskFailed(taskID, "timeout waiting for resource")
					return
				case <-ctx.Done():
					w.ReleaseResources(taskID, acquiredResources)
					w.RemoveWaitForLock(taskID, res)
					return
				}
			} else {
				w.RemoveWaitForLock(taskID, res)
				acquiredResources = append(acquiredResources, res)
				log.Printf("Task %s acquired %s", taskID, res)
				time.Sleep(2 * time.Second)
			}
		}
	}

	time.Sleep(5 * time.Second)

	w.ReleaseResources(taskID, acquiredResources)
	w.MarkTaskCompleted(taskID)
	log.Printf("Task %s completed successfully", taskID)
}

func (w *Worker) AcquireResource(taskID, resourceID string) error {
	result := config.DB.Exec(`
		INSERT INTO lock_resources (resource_id, task_id, is_locked, locked_at, created_at, updated_at)
		VALUES (?, ?, ?, ?, NOW(), NOW())
		ON CONFLICT (resource_id) DO NOTHING
	`, resourceID, taskID, true, time.Now())

	if result.RowsAffected == 0 {
		var lock models.LockResource
		if err := config.DB.Where("resource_id = ?", resourceID).First(&lock).Error; err != nil {
			return err
		}
		if !lock.IsLocked || lock.TaskID == taskID {
			return config.DB.Model(&lock).
				Updates(map[string]interface{}{
					"task_id":   taskID,
					"is_locked": true,
					"locked_at": time.Now(),
					"updated_at": time.Now(),
				}).Error
		}
		return fmt.Errorf("resource locked by another task")
	}

	return nil
}

func (w *Worker) AddWaitForLock(taskID, resourceID string) {
	var existing models.WaitForLock
	if err := config.DB.Where("task_id = ? AND resource_id = ?", taskID, resourceID).First(&existing).Error; err == nil {
		return
	}

	wait := models.WaitForLock{
		TaskID:     taskID,
		ResourceID: resourceID,
		WaitingAt:  time.Now(),
	}
	config.DB.Create(&wait)
}

func (w *Worker) RemoveWaitForLock(taskID, resourceID string) {
	config.DB.Where("task_id = ? AND resource_id = ?", taskID, resourceID).Delete(&models.WaitForLock{})
}

func (w *Worker) ReleaseResources(taskID string, resources []string) {
	for _, res := range resources {
		config.DB.Model(&models.LockResource{}).
			Where("resource_id = ? AND task_id = ?", res, taskID).
			Updates(map[string]interface{}{
				"is_locked": false,
				"task_id":   "",
				"locked_at": nil,
			})
	}
}

func (w *Worker) MarkTaskCompleted(taskID string) {
	now := time.Now()
	config.DB.Model(&models.Task{}).
		Where("task_id = ?", taskID).
		Updates(map[string]interface{}{
			"status":       models.TaskStatusCompleted,
			"completed_at": &now,
			"run_duration": time.Since(time.Now().Add(-10 * time.Second)).Milliseconds(),
		})
}

func (w *Worker) MarkTaskFailed(taskID string, reason string) {
	now := time.Now()
	config.DB.Model(&models.Task{}).
		Where("task_id = ?", taskID).
		Updates(map[string]interface{}{
			"status":       models.TaskStatusFailed,
			"completed_at": &now,
		})
}

func main() {
	config.InitDB()
	config.InitRedis()

	workerID := fmt.Sprintf("worker_%d", time.Now().UnixNano())
	if len(os.Args) > 1 {
		workerID = os.Args[1]
	}

	worker := NewWorker(workerID)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-sigChan
		log.Println("Shutdown signal received")
		cancel()
	}()

	if err := worker.Start(ctx); err != nil {
		log.Fatalf("Worker error: %v", err)
	}
}

package redis

import (
	"context"
	"deadlock-detector/config"
	"deadlock-detector/internal/database"
	"encoding/json"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
)

var rdb *redis.Client
var ctx = context.Background()

type TaskMessage struct {
	TaskID    uint   `json:"task_id"`
	TaskName  string `json:"task_name"`
	Priority  int    `json:"priority"`
	RetryCount int   `json:"retry_count"`
}

func InitRedis() error {
	rdb = redis.NewClient(&redis.Options{
		Addr:     config.RedisAddr,
		Password: config.RedisPassword,
		DB:       config.RedisDB,
	})

	_, err := rdb.Ping(ctx).Result()
	if err != nil {
		return fmt.Errorf("failed to connect redis: %w", err)
	}

	err = rdb.XGroupCreateMkStream(ctx, config.TaskStreamName, config.TaskGroup, "0").Err()
	if err != nil && err.Error() != "BUSYGROUP Consumer Group name already exists" {
		return fmt.Errorf("failed to create consumer group: %w", err)
	}

	return nil
}

func CloseRedis() {
	if rdb != nil {
		rdb.Close()
	}
}

func GetClient() *redis.Client {
	return rdb
}

func EnqueueTask(task *database.Task) error {
	msg := TaskMessage{
		TaskID:    task.ID,
		TaskName:  task.Name,
		Priority:  task.Priority,
		RetryCount: task.RetryCount,
	}

	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	_, err = rdb.XAdd(ctx, &redis.XAddArgs{
		Stream: config.TaskStreamName,
		Values: map[string]interface{}{
			"data": string(data),
		},
	}).Result()

	return err
}

func EnqueueTaskWithDelay(task *database.Task, delay time.Duration) error {
	msg := TaskMessage{
		TaskID:    task.ID,
		TaskName:  task.Name,
		Priority:  task.Priority,
		RetryCount: task.RetryCount,
	}

	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}

	go func() {
		time.Sleep(delay)
		rdb.XAdd(ctx, &redis.XAddArgs{
			Stream: config.TaskStreamName,
			Values: map[string]interface{}{
				"data": string(data),
			},
		})
	}()

	return nil
}

func ClaimTask(workerID string) (*TaskMessage, error) {
	streams, err := rdb.XReadGroup(ctx, &redis.XReadGroupArgs{
		Group:    config.TaskGroup,
		Consumer: workerID,
		Streams:  []string{config.TaskStreamName, ">"},
		Count:    1,
		Block:    0,
	}).Result()

	if err != nil {
		return nil, err
	}

	if len(streams) == 0 || len(streams[0].Messages) == 0 {
		return nil, fmt.Errorf("no messages")
	}

	msg := streams[0].Messages[0]
	dataStr := msg.Values["data"].(string)

	var taskMsg TaskMessage
	err = json.Unmarshal([]byte(dataStr), &taskMsg)
	if err != nil {
		return nil, err
	}

	return &taskMsg, nil
}

func AckTask(msgID string) error {
	_, err := rdb.XAck(ctx, config.TaskStreamName, config.TaskGroup, msgID).Result()
	return err
}

func GetPendingTasks() ([]redis.XMessage, error) {
	result, err := rdb.XPending(ctx, config.TaskStreamName, config.TaskGroup).Result()
	if err != nil {
		return nil, err
	}

	if result.Count == 0 {
		return []redis.XMessage{}, nil
	}

	messages, err := rdb.XRange(ctx, config.TaskStreamName, result.Lower, result.Higher).Result()
	return messages, err
}

package lock

import (
	"context"
	"fmt"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/google/uuid"
)

type DistributedLock interface {
	Lock(ctx context.Context, key string, ttl time.Duration) (string, bool, error)
	Unlock(ctx context.Context, key, token string) error
	Refresh(ctx context.Context, key, token string, ttl time.Duration) (bool, error)
}

type redisLock struct {
	client *redis.Client
}

func NewRedisLock(client *redis.Client) DistributedLock {
	return &redisLock{client: client}
}

func (l *redisLock) Lock(ctx context.Context, key string, ttl time.Duration) (string, bool, error) {
	lockKey := l.getLockKey(key)
	token := uuid.New().String()
	
	success, err := l.client.SetNX(ctx, lockKey, token, ttl).Result()
	if err != nil {
		return "", false, fmt.Errorf("failed to acquire lock: %w", err)
	}
	return token, success, nil
}

func (l *redisLock) Unlock(ctx context.Context, key, token string) error {
	lockKey := l.getLockKey(key)
	
	script := `
	if redis.call("GET", KEYS[1]) == ARGV[1] then
		return redis.call("DEL", KEYS[1])
	else
		return 0
	end
	`
	
	result, err := l.client.Eval(ctx, script, []string{lockKey}, token).Result()
	if err != nil {
		return fmt.Errorf("failed to release lock: %w", err)
	}
	
	if result.(int64) == 0 {
		return fmt.Errorf("lock not owned or already released")
	}
	
	return nil
}

func (l *redisLock) Refresh(ctx context.Context, key, token string, ttl time.Duration) (bool, error) {
	lockKey := l.getLockKey(key)
	
	script := `
	if redis.call("GET", KEYS[1]) == ARGV[1] then
		return redis.call("EXPIRE", KEYS[1], ARGV[2])
	else
		return 0
	end
	`
	
	result, err := l.client.Eval(ctx, script, []string{lockKey}, token, int(ttl.Seconds())).Result()
	if err != nil {
		return false, fmt.Errorf("failed to refresh lock: %w", err)
	}
	
	return result.(int64) == 1, nil
}

func (l *redisLock) getLockKey(key string) string {
	return fmt.Sprintf("task:lock:%s", key)
}

func NewRedisClient(addr, password string, db int) (*redis.Client, error) {
	client := redis.NewClient(&redis.Options{
		Addr:     addr,
		Password: password,
		DB:       db,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to redis: %w", err)
	}

	return client, nil
}

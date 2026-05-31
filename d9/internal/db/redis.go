package db

import (
	"context"
	"fmt"
	"log"

	"github.com/cardgame/internal/config"
	"github.com/redis/go-redis/v9"
)

var RedisClient *redis.Client
var Ctx = context.Background()

func InitRedis(cfg *config.RedisConfig) error {
	RedisClient = redis.NewClient(&redis.Options{
		Addr:     cfg.Addr,
		Password: cfg.Password,
		DB:       cfg.DB,
	})

	if err := RedisClient.Ping(Ctx).Err(); err != nil {
		return fmt.Errorf("failed to ping redis: %w", err)
	}

	log.Println("Redis connected successfully")
	return nil
}

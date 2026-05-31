package main

import (
	"deadlock-detector/internal/api"
	"deadlock-detector/internal/database"
	"deadlock-detector/internal/detector"
	"deadlock-detector/internal/redis"
	"deadlock-detector/internal/scheduler"
	"log"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	if err := database.InitDB(); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.CloseDB()

	if err := redis.InitRedis(); err != nil {
		log.Fatalf("Failed to initialize redis: %v", err)
	}
	defer redis.CloseRedis()

	deadlockDetector := detector.NewDeadlockDetector()
	scheduler.Start(deadlockDetector)

	router := api.SetupRouter()

	go func() {
		if err := router.Run(":8080"); err != nil {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	log.Println("Deadlock Detector Service started on :8080")

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down...")
	scheduler.Stop()
	log.Println("Service stopped")
}

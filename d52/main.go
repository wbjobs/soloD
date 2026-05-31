package main

import (
	"deadlock-detector/config"
	"deadlock-detector/detector"
	"deadlock-detector/handlers"
	"log"
	"os"

	"github.com/gin-gonic/gin"
)

func main() {
	config.InitDB()
	log.Println("Database initialized successfully")

	config.InitRedis()
	log.Println("Redis initialized successfully")

	deadlockDetector := detector.NewDeadlockDetector()
	if err := deadlockDetector.Start(); err != nil {
		log.Fatalf("Failed to start deadlock detector: %v", err)
	}
	defer deadlockDetector.Stop()

	apiHandler := handlers.NewAPIHandler(deadlockDetector)

	gin.SetMode(gin.ReleaseMode)
	if os.Getenv("GIN_MODE") == "debug" {
		gin.SetMode(gin.DebugMode)
	}

	r := gin.Default()

	r.Use(gin.Logger())
	r.Use(gin.Recovery())

	api := r.Group("/api/v1")
	{
		api.GET("/health", apiHandler.HealthCheck)

		api.GET("/deadlocks", apiHandler.GetDeadlockHistory)
		api.GET("/deadlocks/:id", apiHandler.GetDeadlockByID)
		api.POST("/deadlocks/detect", apiHandler.TriggerDetection)

		api.GET("/tasks", apiHandler.GetTasks)
		api.POST("/tasks", apiHandler.CreateTask)
		api.GET("/tasks/:task_id/dependencies", apiHandler.GetTaskDependencies)

		api.GET("/locks", apiHandler.GetLockStatus)

		api.GET("/strategy/config", apiHandler.GetStrategyConfig)
		api.PUT("/strategy/config", apiHandler.UpdateStrategyConfig)

		api.POST("/prediction/trigger", apiHandler.TriggerPrediction)
		api.GET("/prediction/history", apiHandler.GetPredictionHistory)

		api.POST("/alert/test", apiHandler.SendTestAlert)
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s...", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

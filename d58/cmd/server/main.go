package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"istio-fault-injection-engine/pkg/api"
	"istio-fault-injection-engine/pkg/storage"
)

type Config struct {
	Port         string
	EtcdEndpoints []string
	LogLevel     string
}

func main() {
	config := loadConfig()

	store, err := storage.NewEtcdStore(config.EtcdEndpoints)
	if err != nil {
		log.Fatalf("Failed to connect to etcd: %v", err)
	}
	defer store.Close()

	gin.SetMode(gin.ReleaseMode)
	if config.LogLevel == "debug" {
		gin.SetMode(gin.DebugMode)
	}

	r := gin.Default()
	
	r.Use(CORS())
	r.Use(Recovery())

	handler := api.NewHandler(store)
	handler.RegisterRoutes(r)

	srv := &http.Server{
		Addr:    ":" + config.Port,
		Handler: r,
	}

	go func() {
		log.Printf("Server starting on port %s...", config.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exited")
}

func loadConfig() *Config {
	port := os.Getenv("SERVER_PORT")
	if port == "" {
		port = "8080"
	}

	etcdEndpointsStr := os.Getenv("ETCD_ENDPOINTS")
	if etcdEndpointsStr == "" {
		etcdEndpointsStr = "localhost:2379"
	}
	etcdEndpoints := strings.Split(etcdEndpointsStr, ",")

	logLevel := os.Getenv("LOG_LEVEL")
	if logLevel == "" {
		logLevel = "info"
	}

	return &Config{
		Port:         port,
		EtcdEndpoints: etcdEndpoints,
		LogLevel:     logLevel,
	}
}

func CORS() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}

		c.Next()
	}
}

func Recovery() gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if err := recover(); err != nil {
				log.Printf("Panic recovered: %v", err)
				c.JSON(http.StatusInternalServerError, gin.H{
					"error": "Internal server error",
				})
				c.Abort()
			}
		}()
		c.Next()
	}
}

package main

import (
	"os"
	"smart-contract-scanner/internal/api"
	"smart-contract-scanner/internal/config"
	"smart-contract-scanner/internal/scanner"

	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load()

	if err := os.MkdirAll(cfg.UploadDir, 0755); err != nil {
		panic("Failed to create upload directory: " + err.Error())
	}

	if os.Getenv("GIN_MODE") == "release" {
		gin.SetMode(gin.ReleaseMode)
	}

	authHandler := api.NewAuthHandler(cfg)
	rateLimiter := api.NewRateLimiter(cfg)
	scanner := scanner.NewScanner(cfg)
	scanHandler := api.NewScanHandler(cfg, scanner)

	r := gin.Default()

	r.Use(rateLimiter.Middleware())

	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	})

	public := r.Group("/api/v1")
	{
		public.POST("/login", authHandler.Login)
		public.GET("/health", scanHandler.HealthCheck)
	}

	protected := r.Group("/api/v1")
	protected.Use(authHandler.JWTMiddleware())
	{
		protected.POST("/scan/upload", scanHandler.UploadAndScan)
		protected.POST("/scan/code", scanHandler.ScanFromCode)
		protected.POST("/compare/upload", scanHandler.UploadAndCompare)
		protected.POST("/compare/code", scanHandler.CompareFromCode)
	}

	r.Run(":" + cfg.Port)
}

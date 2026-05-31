package config

import (
	"os"
	"strconv"
)

type Config struct {
	Port            string
	JWTSecret       string
	JWTExpiration   int
	RateLimit       int
	RateBurst       int
	UploadDir       string
	SlitherPath     string
	MaxUploadSize   int64
	ScanTimeout     int
}

func Load() *Config {
	return &Config{
		Port:          getEnv("PORT", "8080"),
		JWTSecret:     getEnv("JWT_SECRET", "your-secret-key-change-in-production"),
		JWTExpiration: getEnvInt("JWT_EXPIRATION", 3600),
		RateLimit:     getEnvInt("RATE_LIMIT", 10),
		RateBurst:     getEnvInt("RATE_BURST", 20),
		UploadDir:     getEnv("UPLOAD_DIR", "./uploads"),
		SlitherPath:   getEnv("SLITHER_PATH", "slither"),
		MaxUploadSize: getEnvInt64("MAX_UPLOAD_SIZE", 10*1024*1024),
		ScanTimeout:   getEnvInt("SCAN_TIMEOUT", 120),
	}
}

func getEnv(key, defaultValue string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value, exists := os.LookupEnv(key); exists {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}

func getEnvInt64(key string, defaultValue int64) int64 {
	if value, exists := os.LookupEnv(key); exists {
		if intValue, err := strconv.ParseInt(value, 10, 64); err == nil {
			return intValue
		}
	}
	return defaultValue
}

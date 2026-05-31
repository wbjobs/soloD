package api

import (
	"net/http"
	"smart-contract-scanner/internal/config"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/time/rate"
)

type RateLimiter struct {
	config  *config.Config
	clients map[string]*clientLimiter
	mu      sync.RWMutex
}

type clientLimiter struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

func NewRateLimiter(cfg *config.Config) *RateLimiter {
	rl := &RateLimiter{
		config:  cfg,
		clients: make(map[string]*clientLimiter),
	}
	go rl.cleanupStaleClients()
	return rl
}

func (rl *RateLimiter) getLimiter(ip string) *rate.Limiter {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	limiter, exists := rl.clients[ip]
	if !exists {
		limiter = &clientLimiter{
			limiter:  rate.NewLimiter(rate.Limit(rl.config.RateLimit), rl.config.RateBurst),
			lastSeen: time.Now(),
		}
		rl.clients[ip] = limiter
		return limiter.limiter
	}

	limiter.lastSeen = time.Now()
	return limiter.limiter
}

func (rl *RateLimiter) cleanupStaleClients() {
	for {
		time.Sleep(time.Minute)
		rl.mu.Lock()
		for ip, client := range rl.clients {
			if time.Since(client.lastSeen) > 3*time.Minute {
				delete(rl.clients, ip)
			}
		}
		rl.mu.Unlock()
	}
}

func (rl *RateLimiter) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()
		limiter := rl.getLimiter(ip)

		if !limiter.Allow() {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"error": "Rate limit exceeded",
				"limit": rl.config.RateLimit,
				"burst": rl.config.RateBurst,
			})
			c.Abort()
			return
		}

		c.Next()
	}
}

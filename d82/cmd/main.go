package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"ebpf-monitor/api"
	"ebpf-monitor/ebpf"
	"ebpf-monitor/pkg/logger"

	"github.com/gin-gonic/gin"
)

func main() {
	targetPid := flag.Uint("pid", 0, "target process ID to monitor")
	addr := flag.String("addr", ":8080", "API server address")
	rulesFile := flag.String("rules", "", "path to ignore rules file (for persistence)")
	flag.Parse()

	if *targetPid == 0 {
		log.Fatal("Please specify target PID with -pid flag")
	}

	eventLogger := logger.NewLogger()

	monitor, err := ebpf.NewEbpfMonitor(eventLogger, uint32(*targetPid))
	if err != nil {
		log.Fatalf("Failed to create eBPF monitor: %v", err)
	}
	defer monitor.Stop()

	if *rulesFile != "" {
		if err := monitor.LoadRulesFromFile(*rulesFile); err != nil {
			log.Printf("Warning: failed to load rules from file: %v", err)
		} else {
			log.Printf("Loaded %d ignore rules from %s", len(monitor.GetIgnoreRules()), *rulesFile)
		}
		
		defer func() {
			if err := monitor.SaveRulesToFile(*rulesFile); err != nil {
				log.Printf("Warning: failed to save rules to file: %v", err)
			} else {
				log.Printf("Saved %d ignore rules to %s", len(monitor.GetIgnoreRules()), *rulesFile)
			}
		}()
	}

	monitor.Start()
	log.Printf("eBPF monitor started, monitoring PID: %d", *targetPid)

	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

	handler := api.NewHandler(eventLogger, monitor)
	api.SetupRoutes(r, handler)

	srv := &http.Server{
		Addr:    *addr,
		Handler: r,
	}

	go func() {
		log.Printf("API server starting on %s", *addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatal("Server forced to shutdown:", err)
	}

	log.Println("Server exited")
}

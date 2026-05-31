package scheduler

import (
	"deadlock-detector/config"
	"deadlock-detector/internal/detector"
	"log"
	"sync"
	"time"
)

var (
	running   bool
	stopChan  chan struct{}
	waitGroup sync.WaitGroup
)

func Start(detectorInstance *detector.DeadlockDetector) {
	if running {
		return
	}

	running = true
	stopChan = make(chan struct{})
	
	waitGroup.Add(1)
	go runScheduler(detectorInstance)
	
	log.Println("Deadlock detector scheduler started")
}

func runScheduler(detectorInstance *detector.DeadlockDetector) {
	defer waitGroup.Done()

	ticker := time.NewTicker(config.DeadlockCheckInterval)
	defer ticker.Stop()

	for {
		select {
		case <-stopChan:
			log.Println("Deadlock detector scheduler stopped")
			return
		case <-ticker.C:
			log.Println("Running deadlock detection...")
			cycles, err := detectorInstance.RunDetection()
			if err != nil {
				log.Printf("Deadlock detection error: %v", err)
				continue
			}
			if cycles > 0 {
				log.Printf("Detection completed: resolved %d deadlock cycles", cycles)
			}
		}
	}
}

func Stop() {
	if !running {
		return
	}

	close(stopChan)
	waitGroup.Wait()
	running = false
}

func IsRunning() bool {
	return running
}

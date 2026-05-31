package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/gorilla/mux"
	"wasm-faas/pkg/wasmrunner"
	"wasm-faas/pkg/ebpf"
)

const (
	maxUploadSize = 10 * 1024 * 1024
	uploadDir     = "./uploads"
)

type ExecRequest struct {
	Function string `json:"function"`
	Input    int64  `json:"input"`
}

type ExecResponse struct {
	Result   int64       `json:"result,omitempty"`
	Error    string      `json:"error,omitempty"`
	ErrorType string     `json:"error_type,omitempty"`
	Success  bool        `json:"success"`
	TimeMs   int64       `json:"time_ms"`
	FuelUsed uint64      `json:"fuel_used,omitempty"`
	MemUsed  uint64      `json:"mem_used,omitempty"`
}

type UploadResponse struct {
	ID     string `json:"id"`
	URL    string `json:"url"`
	Status string `json:"status"`
}

type HealthResponse struct {
	Status       string `json:"status"`
	Version      string `json:"version"`
	Timestamp    int64  `json:"timestamp"`
	CPULimitMs   int    `json:"cpu_limit_ms"`
	MemLimitMB   int    `json:"memory_limit_mb"`
	EBPFEnabled  bool   `json:"ebpf_enabled"`
}

var (
	runner       *wasmrunner.Runner
	executor     *ebpf.Executor
)

func main() {
	if err := os.MkdirAll(uploadDir, 0755); err != nil {
		log.Fatalf("Failed to create upload directory: %v", err)
	}

	runner = wasmrunner.NewRunner()
	
	var err error
	executor, err = ebpf.NewExecutor()
	if err != nil {
		log.Printf("Warning: failed to initialize eBPF executor: %v, using only Wasmtime limits", err)
	} else {
		defer executor.Stop()
	}

	router := mux.NewRouter()

	router.Use(loggingMiddleware)
	router.Use(recoveryMiddleware)

	router.HandleFunc("/upload", handleUpload).Methods("POST")
	router.HandleFunc("/execute/{id}", handleExecute).Methods("POST")
	router.HandleFunc("/health", handleHealth).Methods("GET")
	router.HandleFunc("/functions", handleListFunctions).Methods("GET")

	log.Println("Wasm FaaS Server starting on :8080")
	log.Printf("Configuration: CPU timeout = %dms, Memory limit = %dMB", 
		wasmrunner.TimeoutMs, wasmrunner.MaxMemoryBytes/1024/1024)
	if executor != nil {
		log.Println("eBPF monitoring enabled")
	}
	log.Fatal(http.ListenAndServe(":8080", router))
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		log.Printf("START %s %s from %s", r.Method, r.RequestURI, r.RemoteAddr)
		
		next.ServeHTTP(w, r)
		
		duration := time.Since(start)
		log.Printf("END %s %s duration=%v", r.Method, r.RequestURI, duration)
	})
}

func recoveryMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if err := recover(); err != nil {
				log.Printf("Panic recovered: %v", err)
				http.Error(w, "Internal server error", http.StatusInternalServerError)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func handleUpload(w http.ResponseWriter, r *http.Request) {
	if err := r.ParseMultipartForm(maxUploadSize); err != nil {
		sendError(w, "File too large (max 10MB)", http.StatusBadRequest)
		return
	}

	file, _, err := r.FormFile("wasm")
	if err != nil {
		sendError(w, "Failed to get file from request", http.StatusBadRequest)
		return
	}
	defer file.Close()

	fileID := fmt.Sprintf("%d", time.Now().UnixNano())
	filePath := filepath.Join(uploadDir, fileID+".wasm")

	out, err := os.Create(filePath)
	if err != nil {
		sendError(w, "Failed to save file", http.StatusInternalServerError)
		return
	}
	defer out.Close()

	if _, err := out.ReadFrom(file); err != nil {
		sendError(w, "Failed to write file", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(UploadResponse{
		ID:     fileID,
		URL:    fmt.Sprintf("/execute/%s", fileID),
		Status: "success",
	})
}

func handleExecute(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	fileID := vars["id"]
	filePath := filepath.Join(uploadDir, fileID+".wasm")

	if _, err := os.Stat(filePath); os.IsNotExist(err) {
		sendError(w, fmt.Sprintf("Function %s not found", fileID), http.StatusNotFound)
		return
	}

	var req ExecRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		sendError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.Function == "" {
		req.Function = "calculate"
	}

	result := runner.Execute(filePath, req.Function, req.Input)

	resp := ExecResponse{
		Result:   result.Result,
		Success:  result.Success,
		TimeMs:   result.TimeMs,
		FuelUsed: result.FuelUsed,
		MemUsed:  result.MemUsed,
	}

	if !result.Success && result.Error != nil {
		resp.Error = result.Error.Message
		resp.ErrorType = string(result.Error.Type)
		
		var statusCode int
		switch result.Error.Type {
		case wasmrunner.ErrorTypeTimeout, wasmrunner.ErrorTypeFuelExhausted:
			statusCode = http.StatusRequestTimeout
		case wasmrunner.ErrorTypeFunctionNotFound:
			statusCode = http.StatusNotFound
		case wasmrunner.ErrorTypeMemoryLimit:
			statusCode = http.StatusInsufficientStorage
		default:
			statusCode = http.StatusInternalServerError
		}
		
		w.WriteHeader(statusCode)
	} else {
		w.WriteHeader(http.StatusOK)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	ebpfEnabled := executor != nil && executor.UseEbpf()
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(HealthResponse{
		Status:      "healthy",
		Version:     "2.0.0",
		Timestamp:   time.Now().Unix(),
		CPULimitMs:  wasmrunner.TimeoutMs,
		MemLimitMB:  wasmrunner.MaxMemoryBytes / 1024 / 1024,
		EBPFEnabled: ebpfEnabled,
	})
}

func handleListFunctions(w http.ResponseWriter, r *http.Request) {
	files, err := filepath.Glob(filepath.Join(uploadDir, "*.wasm"))
	if err != nil {
		sendError(w, "Failed to list functions", http.StatusInternalServerError)
		return
	}

	var functions []map[string]string
	for _, f := range files {
		id := filepath.Base(f[:len(f)-5])
		info, _ := os.Stat(f)
		functions = append(functions, map[string]string{
			"id":         id,
			"url":        fmt.Sprintf("/execute/%s", id),
			"size_bytes": fmt.Sprintf("%d", info.Size()),
			"created_at": info.ModTime().Format(time.RFC3339),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"count":     len(functions),
		"functions": functions,
	})
}

func sendError(w http.ResponseWriter, message string, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(ExecResponse{
		Success: false,
		Error:   message,
	})
}

package api

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"smart-contract-scanner/internal/config"
	"smart-contract-scanner/internal/scanner"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type ScanHandler struct {
	config  *config.Config
	scanner *scanner.Scanner
}

type ScanResponse struct {
	Success bool                 `json:"success"`
	Message string                 `json:"message"`
	Data    *scanner.ScanReport   `json:"data,omitempty"`
}

type CompareResponse struct {
	Success bool                      `json:"success"`
	Message string                      `json:"message"`
	Data    *scanner.VersionCompareReport `json:"data,omitempty"`
}

type HealthResponse struct {
	Status    string `json:"status"`
	Timestamp string `json:"timestamp"`
	Version   string `json:"version"`
}

type ScanCodeRequest struct {
	Code     string `json:"code" binding:"required"`
	Filename string `json:"filename"`
}

type CompareCodeRequest struct {
	OldCode     string `json:"old_code" binding:"required"`
	NewCode     string `json:"new_code" binding:"required"`
	OldFilename string `json:"old_filename"`
	NewFilename string `json:"new_filename"`
}

func NewScanHandler(cfg *config.Config, s *scanner.Scanner) *ScanHandler {
	return &ScanHandler{
		config:  cfg,
		scanner: s,
	}
}

func (h *ScanHandler) HealthCheck(c *gin.Context) {
	c.JSON(http.StatusOK, HealthResponse{
		Status:    "ok",
		Timestamp: time.Now().Format(time.RFC3339),
		Version:   "1.0.0",
	})
}

func (h *ScanHandler) UploadAndScan(c *gin.Context) {
	file, err := c.FormFile("contract")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "No file uploaded",
		})
		return
	}

	if file.Size > h.config.MaxUploadSize {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": fmt.Sprintf("File too large. Max size: %d MB", h.config.MaxUploadSize/1024/1024),
		})
		return
	}

	ext := strings.ToLower(filepath.Ext(file.Filename))
	if ext != ".sol" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Only .sol files are allowed",
		})
		return
	}

	scanID := uuid.New().String()
	tempDir := filepath.Join(h.config.UploadDir, scanID)
	if err := os.MkdirAll(tempDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Failed to create upload directory",
		})
		return
	}
	defer os.RemoveAll(tempDir)

	contractPath := filepath.Join(tempDir, file.Filename)
	if err := c.SaveUploadedFile(file, contractPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Failed to save uploaded file",
		})
		return
	}

	result, err := h.scanner.ScanSolidity(contractPath)
	if err != nil && result == nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": fmt.Sprintf("Scan failed: %s", err.Error()),
		})
		return
	}

	if result.Status == "timeout" {
		c.JSON(http.StatusRequestTimeout, ScanResponse{
			Success: false,
			Message: result.Error,
			Data:    result,
		})
		return
	}

	c.JSON(http.StatusOK, ScanResponse{
		Success: true,
		Message: "Scan completed",
		Data:    result,
	})
}

func (h *ScanHandler) ScanFromCode(c *gin.Context) {
	var req ScanCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Invalid request body",
		})
		return
	}

	if len(req.Code) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Code cannot be empty",
		})
		return
	}

	req.Filename = strings.TrimSpace(req.Filename)
	if req.Filename == "" {
		req.Filename = "contract.sol"
	} else if !strings.HasSuffix(req.Filename, ".sol") {
		req.Filename += ".sol"
	}

	scanID := uuid.New().String()
	tempDir := filepath.Join(h.config.UploadDir, scanID)
	if err := os.MkdirAll(tempDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Failed to create temp directory",
		})
		return
	}
	defer os.RemoveAll(tempDir)

	contractPath := filepath.Join(tempDir, req.Filename)
	if err := os.WriteFile(contractPath, []byte(req.Code), 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Failed to write contract file",
		})
		return
	}

	result, err := h.scanner.ScanSolidity(contractPath)
	if err != nil && result == nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": fmt.Sprintf("Scan failed: %s", err.Error()),
		})
		return
	}

	if result.Status == "timeout" {
		c.JSON(http.StatusRequestTimeout, ScanResponse{
			Success: false,
			Message: result.Error,
			Data:    result,
		})
		return
	}

	c.JSON(http.StatusOK, ScanResponse{
		Success: true,
		Message: "Scan completed",
		Data:    result,
	})
}

func (h *ScanHandler) UploadAndCompare(c *gin.Context) {
	oldFile, err := c.FormFile("old_contract")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Old contract file is required",
		})
		return
	}

	newFile, err := c.FormFile("new_contract")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "New contract file is required",
		})
		return
	}

	maxSize := h.config.MaxUploadSize
	if oldFile.Size > maxSize || newFile.Size > maxSize {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": fmt.Sprintf("File too large. Max size: %d MB", maxSize/1024/1024),
		})
		return
	}

	ext1 := strings.ToLower(filepath.Ext(oldFile.Filename))
	ext2 := strings.ToLower(filepath.Ext(newFile.Filename))
	if ext1 != ".sol" || ext2 != ".sol" {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Only .sol files are allowed",
		})
		return
	}

	scanID := uuid.New().String()
	tempDir := filepath.Join(h.config.UploadDir, scanID)
	if err := os.MkdirAll(tempDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Failed to create upload directory",
		})
		return
	}
	defer os.RemoveAll(tempDir)

	oldPath := filepath.Join(tempDir, oldFile.Filename)
	newPath := filepath.Join(tempDir, newFile.Filename)

	if err := c.SaveUploadedFile(oldFile, oldPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Failed to save old contract file",
		})
		return
	}

	if err := c.SaveUploadedFile(newFile, newPath); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Failed to save new contract file",
		})
		return
	}

	result, err := h.scanner.CompareVersions(oldPath, newPath)
	if err != nil && result == nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": fmt.Sprintf("Comparison failed: %s", err.Error()),
		})
		return
	}

	if result.Status != "success" {
		c.JSON(http.StatusOK, CompareResponse{
			Success: false,
			Message: result.Message,
			Data:    result,
		})
		return
	}

	c.JSON(http.StatusOK, CompareResponse{
		Success: true,
		Message: "Comparison completed",
		Data:    result,
	})
}

func (h *ScanHandler) CompareFromCode(c *gin.Context) {
	var req CompareCodeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Invalid request body",
		})
		return
	}

	if len(req.OldCode) == 0 || len(req.NewCode) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{
			"success": false,
			"message": "Both old_code and new_code are required",
		})
		return
	}

	req.OldFilename = strings.TrimSpace(req.OldFilename)
	if req.OldFilename == "" {
		req.OldFilename = "old_contract.sol"
	} else if !strings.HasSuffix(req.OldFilename, ".sol") {
		req.OldFilename += ".sol"
	}

	req.NewFilename = strings.TrimSpace(req.NewFilename)
	if req.NewFilename == "" {
		req.NewFilename = "new_contract.sol"
	} else if !strings.HasSuffix(req.NewFilename, ".sol") {
		req.NewFilename += ".sol"
	}

	result, err := h.scanner.CompareVersionsFromCode(req.OldCode, req.NewCode, req.OldFilename, req.NewFilename)
	if err != nil && result == nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": fmt.Sprintf("Comparison failed: %s", err.Error()),
		})
		return
	}

	if result.Status != "success" {
		c.JSON(http.StatusOK, CompareResponse{
			Success: false,
			Message: result.Message,
			Data:    result,
		})
		return
	}

	c.JSON(http.StatusOK, CompareResponse{
		Success: true,
		Message: "Comparison completed",
		Data:    result,
	})
}

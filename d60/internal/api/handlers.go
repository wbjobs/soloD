package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"sync"

	"voice-translation-gateway/internal/config"
)

type APIHandler struct {
	configManager *config.HotUpdateManager
	sessions      map[string]*VADSession
	mu            sync.RWMutex
}

type VADSession struct {
	ID             string
	DetectedLang   string
	LangConfidence float32
	SpeechRate     float64
	CurrentProfile string
}

func NewAPIHandler(configManager *config.HotUpdateManager) *APIHandler {
	return &APIHandler{
		configManager: configManager,
		sessions:      make(map[string]*VADSession),
	}
}

func (h *APIHandler) GetProfiles(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	profiles := h.configManager.GetAllProfiles()
	json.NewEncoder(w).Encode(map[string]interface{}{
		"profiles":       profiles,
		"activeProfile":  h.configManager.GetActiveProfile().Name,
		"abTestEnabled":  false,
	})
}

func (h *APIHandler) SetActiveProfile(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		ProfileName string `json:"profileName"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	success := h.configManager.SetActiveProfile(req.ProfileName)
	if !success {
		http.Error(w, "Profile not found", http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":       true,
		"activeProfile": req.ProfileName,
	})
}

func (h *APIHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var profile config.VADProfile
	if err := json.NewDecoder(r.Body).Decode(&profile); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	update := config.ConfigUpdate{
		Profiles: []config.VADProfile{profile},
	}
	h.configManager.UpdateConfig(update)

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"profile": profile,
	})
}

func (h *APIHandler) StartABTest(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		TestID       string   `json:"testId"`
		ProfileNames []string `json:"profileNames"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	h.configManager.StartABTest(req.TestID, req.ProfileNames)

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":      true,
		"testId":       req.TestID,
		"profiles":     req.ProfileNames,
	})
}

func (h *APIHandler) EndABTest(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	results := h.configManager.EndABTest()

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
		"results": results,
	})
}

func (h *APIHandler) CalculateBLEU(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Reference string `json:"reference"`
		Candidate string `json:"candidate"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	score := config.CalculateBLEU(req.Reference, req.Candidate)

	json.NewEncoder(w).Encode(map[string]interface{}{
		"score":           score.Score,
		"brevityPenalty": score.BrevityPenalty,
		"ngramScores":    score.NgramScores,
	})
}

func (h *APIHandler) GetLanguageConfigs(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	langConfigs := map[string]map[string]interface{}{
		"zh": {
			"name":             "中文",
			"silenceDurationMs": 260,
			"vadThreshold":     0.45,
		},
		"en": {
			"name":             "英语",
			"silenceDurationMs": 320,
			"vadThreshold":     0.50,
		},
		"ja": {
			"name":             "日语",
			"silenceDurationMs": 350,
			"vadThreshold":     0.55,
		},
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"languages": langConfigs,
	})
}

func (h *APIHandler) UpdateSession(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var session VADSession
	if err := json.NewDecoder(r.Body).Decode(&session); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	h.mu.Lock()
	h.sessions[session.ID] = &session
	h.mu.Unlock()

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": true,
	})
}

func (h *APIHandler) GetSessionStats(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	sessionID := r.URL.Query().Get("sessionId")

	h.mu.RLock()
	defer h.mu.RUnlock()

	if sessionID != "" {
		if session, exists := h.sessions[sessionID]; exists {
			json.NewEncoder(w).Encode(map[string]interface{}{
				"sessionId":      session.ID,
				"detectedLang":   session.DetectedLang,
				"langConfidence": session.LangConfidence,
				"speechRate":     session.SpeechRate,
				"currentProfile": session.CurrentProfile,
			})
			return
		}
	}

	sessions := make([]*VADSession, 0, len(h.sessions))
	for _, s := range h.sessions {
		sessions = append(sessions, s)
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"totalSessions": len(h.sessions),
		"sessions":      sessions,
	})
}

func (h *APIHandler) ExportConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", "attachment; filename=vad-config.json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	data, err := h.configManager.ExportConfig()
	if err != nil {
		http.Error(w, "Failed to export config", http.StatusInternalServerError)
		return
	}

	w.Write(data)
}

func (h *APIHandler) ImportConfig(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var update config.ConfigUpdate
	if err := json.NewDecoder(r.Body).Decode(&update); err != nil {
		http.Error(w, "Invalid request", http.StatusBadRequest)
		return
	}

	h.configManager.UpdateConfig(update)

	json.NewEncoder(w).Encode(map[string]interface{}{
		"success":       true,
		"activeProfile": h.configManager.GetActiveProfile().Name,
	})
}

func ParseIntParam(r *http.Request, name string, defaultValue int) int {
	valStr := r.URL.Query().Get(name)
	if valStr == "" {
		return defaultValue
	}

	val, err := strconv.Atoi(valStr)
	if err != nil {
		return defaultValue
	}

	return val
}

func ParseFloatParam(r *http.Request, name string, defaultValue float64) float64 {
	valStr := r.URL.Query().Get(name)
	if valStr == "" {
		return defaultValue
	}

	val, err := strconv.ParseFloat(valStr, 64)
	if err != nil {
		return defaultValue
	}

	return val
}

func ParseBoolParam(r *http.Request, name string, defaultValue bool) bool {
	valStr := r.URL.Query().Get(name)
	if valStr == "" {
		return defaultValue
	}

	valStr = strings.ToLower(valStr)
	return valStr == "true" || valStr == "1" || valStr == "yes"
}

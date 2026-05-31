package config

import (
	"encoding/json"
	"math"
	"strings"
	"sync"
	"time"
)

type VADProfile struct {
	Name              string  `json:"name"`
	PreRollMs         int     `json:"preRollMs"`
	PostRollMs        int     `json:"postRollMs"`
	SilenceDurationMs int     `json:"silenceDurationMs"`
	MinSegmentMs      int     `json:"minSegmentMs"`
	Threshold         float32 `json:"threshold"`
}

type BLEUScore struct {
	Score        float64   `json:"score"`
	BrevityPenalty float64 `json:"brevityPenalty"`
	NgramScores  []float64 `json:"ngramScores"`
	Timestamp    time.Time `json:"timestamp"`
}

type ABTestResult struct {
	ProfileName  string     `json:"profileName"`
	TestID       string     `json:"testId"`
	SegmentCount int        `json:"segmentCount"`
	TotalBLEU    float64    `json:"totalBLEU"`
	AvgBLEU      float64    `json:"avgBLEU"`
	LatencyMs    float64    `json:"avgLatencyMs"`
	StartTime    time.Time  `json:"startTime"`
	EndTime      time.Time  `json:"endTime"`
	Scores       []BLEUScore `json:"-"`
}

type ConfigUpdate struct {
	UpdateID    string     `json:"updateId"`
	Profiles    []VADProfile `json:"profiles"`
	ActiveProfile string    `json:"activeProfile"`
	ABTestEnabled bool      `json:"abTestEnabled"`
	Timestamp   time.Time  `json:"timestamp"`
}

type HotUpdateManager struct {
	profiles      map[string]VADProfile
	activeProfile string
	abTestEnabled bool
	currentTestID string
	testResults   map[string]*ABTestResult
	mu            sync.RWMutex
	updateCallbacks []func(*VADProfile)
}

func NewHotUpdateManager() *HotUpdateManager {
	defaultProfiles := map[string]VADProfile{
		"default": {
			Name:              "default",
			PreRollMs:         200,
			PostRollMs:        150,
			SilenceDurationMs: 300,
			MinSegmentMs:      800,
			Threshold:         0.5,
		},
		"aggressive": {
			Name:              "aggressive",
			PreRollMs:         150,
			PostRollMs:        100,
			SilenceDurationMs: 200,
			MinSegmentMs:      500,
			Threshold:         0.4,
		},
		"conservative": {
			Name:              "conservative",
			PreRollMs:         300,
			PostRollMs:        200,
			SilenceDurationMs: 400,
			MinSegmentMs:      1200,
			Threshold:         0.6,
		},
	}

	return &HotUpdateManager{
		profiles:      defaultProfiles,
		activeProfile: "default",
		abTestEnabled: false,
		testResults:   make(map[string]*ABTestResult),
	}
}

func (m *HotUpdateManager) UpdateConfig(update ConfigUpdate) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, profile := range update.Profiles {
		m.profiles[profile.Name] = profile
	}

	if update.ActiveProfile != "" {
		m.activeProfile = update.ActiveProfile
	}

	m.abTestEnabled = update.ABTestEnabled

	m.notifyCallbacks()

	return nil
}

func (m *HotUpdateManager) GetProfile(name string) (VADProfile, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	profile, exists := m.profiles[name]
	return profile, exists
}

func (m *HotUpdateManager) GetActiveProfile() VADProfile {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if profile, exists := m.profiles[m.activeProfile]; exists {
		return profile
	}
	return m.profiles["default"]
}

func (m *HotUpdateManager) SetActiveProfile(name string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.profiles[name]; exists {
		m.activeProfile = name
		m.notifyCallbacks()
		return true
	}
	return false
}

func (m *HotUpdateManager) RegisterCallback(callback func(*VADProfile)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.updateCallbacks = append(m.updateCallbacks, callback)
}

func (m *HotUpdateManager) notifyCallbacks() {
	profile := m.profiles[m.activeProfile]
	for _, callback := range m.updateCallbacks {
		go callback(&profile)
	}
}

func (m *HotUpdateManager) StartABTest(testID string, profileNames []string) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.currentTestID = testID
	m.abTestEnabled = true

	for _, name := range profileNames {
		if _, exists := m.profiles[name]; exists {
			m.testResults[name] = &ABTestResult{
				ProfileName: name,
				TestID:      testID,
				StartTime:   time.Now(),
				Scores:      make([]BLEUScore, 0),
			}
		}
	}

	return nil
}

func (m *HotUpdateManager) EndABTest() map[string]*ABTestResult {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.abTestEnabled = false

	for _, result := range m.testResults {
		result.EndTime = time.Now()
		if result.SegmentCount > 0 {
			result.AvgBLEU = result.TotalBLEU / float64(result.SegmentCount)
		}
	}

	return m.testResults
}

func (m *HotUpdateManager) RecordScore(profileName string, reference, candidate string, latencyMs float64) *BLEUScore {
	score := CalculateBLEU(reference, candidate)

	if m.abTestEnabled {
		m.mu.Lock()
		defer m.mu.Unlock()

		if result, exists := m.testResults[profileName]; exists {
			result.SegmentCount++
			result.TotalBLEU += score.Score
			result.LatencyMs = (result.LatencyMs*float64(result.SegmentCount-1) + latencyMs) / float64(result.SegmentCount)
			result.Scores = append(result.Scores, *score)
		}
	}

	return score
}

func CalculateBLEU(reference, candidate string) *BLEUScore {
	refNgrams := tokenizeNgrams(reference, 4)
	candNgrams := tokenizeNgrams(candidate, 4)

	maxN := 4
	ngramScores := make([]float64, maxN)

	for n := 1; n <= maxN; n++ {
		matches := 0
		total := len(candNgrams[n])

		if total == 0 {
			ngramScores[n-1] = 0
			continue
		}

		for ngram, candCount := range candNgrams[n] {
			if refCount, exists := refNgrams[n][ngram]; exists {
				matches += min(candCount, refCount)
			}
		}

		ngramScores[n-1] = float64(matches) / float64(total)
	}

	refLen := float64(len(strings.Fields(reference)))
	candLen := float64(len(strings.Fields(candidate)))

	var brevityPenalty float64
	if candLen >= refLen {
		brevityPenalty = 1.0
	} else if candLen > 0 {
		brevityPenalty = math.Exp(1 - refLen/candLen)
	} else {
		brevityPenalty = 0
	}

	geometricMean := 0.0
	for _, score := range ngramScores {
		if score > 0 {
			geometricMean += math.Log(score)
		}
	}
	geometricMean = math.Exp(geometricMean / 4.0)

	finalScore := brevityPenalty * geometricMean

	return &BLEUScore{
		Score:          finalScore,
		BrevityPenalty: brevityPenalty,
		NgramScores:    ngramScores,
		Timestamp:      time.Now(),
	}
}

func tokenizeNgrams(text string, maxN int) map[int]map[string]int {
	tokens := strings.Fields(text)
	result := make(map[int]map[string]int)

	for n := 1; n <= maxN; n++ {
		result[n] = make(map[string]int)

		for i := 0; i <= len(tokens)-n; i++ {
			ngram := strings.Join(tokens[i:i+n], " ")
			result[n][ngram]++
		}
	}

	return result
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func (m *HotUpdateManager) GetAllProfiles() []VADProfile {
	m.mu.RLock()
	defer m.mu.RUnlock()

	profiles := make([]VADProfile, 0, len(m.profiles))
	for _, p := range m.profiles {
		profiles = append(profiles, p)
	}
	return profiles
}

func (m *HotUpdateManager) ExportConfig() ([]byte, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	profiles := m.GetAllProfiles()
	update := ConfigUpdate{
		Profiles:      profiles,
		ActiveProfile: m.activeProfile,
		ABTestEnabled: m.abTestEnabled,
		Timestamp:     time.Now(),
	}

	return json.MarshalIndent(update, "", "  ")
}

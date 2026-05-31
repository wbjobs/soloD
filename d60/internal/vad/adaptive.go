package vad

import (
	"sync"
	"time"

	"voice-translation-gateway/internal/language"
	"voice-translation-gateway/internal/speechrate"
	config_manager "voice-translation-gateway/internal/config"
)

type AdaptiveVADDetector struct {
	config         VADConfig
	state          VADState
	buffer         []byte
	currentSegment *AudioSegment
	silenceFrames  int
	speechFrames   int
	segmentID      int64
	startTime      int64
	mu             sync.RWMutex
	callback       func(*AudioSegment)

	preRollBuffer    []frameWithTimestamp
	preRollMaxFrames int
	postRollFrames   int
	postRollCount    int

	pendingSegment *AudioSegment
	mergeThresholdMs int

	langDetector   *language.LanguageDetector
	rateAnalyzer   *speechrate.SpeechRateAnalyzer
	silencePredictor *speechrate.SilencePredictor

	detectedLanguage language.Language
	detectedLangConf float32
	currentSpeechRate float64

	baseSilenceMs    int
	baseThreshold    float32

	configManager    *config_manager.HotUpdateManager
	currentProfile   string
}

func NewAdaptiveVADDetector(sampleRate int, configManager *config_manager.HotUpdateManager) *AdaptiveVADDetector {
	profile := configManager.GetActiveProfile()

	return &AdaptiveVADDetector{
		config: VADConfig{
			PreRollMs:         profile.PreRollMs,
			PostRollMs:        profile.PostRollMs,
			SilenceDurationMs: profile.SilenceDurationMs,
			MinSegmentMs:      profile.MinSegmentMs,
			Threshold:         profile.Threshold,
			SampleRate:        sampleRate,
		},
		state:            StateSilence,
		segmentID:        0,
		preRollBuffer:    make([]frameWithTimestamp, 0, 50),
		preRollMaxFrames: (profile.PreRollMs * 16000 / 1000) / 640,
		postRollFrames:   (profile.PostRollMs + 19) / 20,
		mergeThresholdMs: profile.MinSegmentMs,

		langDetector:     language.NewLanguageDetector(sampleRate),
		rateAnalyzer:     speechrate.NewSpeechRateAnalyzer(sampleRate),
		silencePredictor: speechrate.NewSilencePredictor(100),

		baseSilenceMs:    profile.SilenceDurationMs,
		baseThreshold:    profile.Threshold,

		configManager:    configManager,
		currentProfile:   profile.Name,
	}
}

func (a *AdaptiveVADDetector) SetCallback(callback func(*AudioSegment)) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.callback = callback
}

func (a *AdaptiveVADDetector) ProcessFrame(audioData []byte, timestamp int64) (VADState, error) {
	a.mu.Lock()
	defer a.mu.Unlock()

	if len(audioData) == 0 {
		return a.state, nil
	}

	energy := a.calculateEnergy(audioData)

	vadStateInt := 1
	if a.state == StateSilence {
		vadStateInt = 0
	}
	a.silencePredictor.Update(float64(energy), vadStateInt)

	if !a.langDetector.IsDetected() {
		if result, detected := a.langDetector.ProcessFrame(audioData, timestamp); detected {
			a.detectedLanguage = result.Language
			a.detectedLangConf = result.Confidence
			a.adjustForLanguage()
		}
	}

	if _, updated := a.rateAnalyzer.ProcessFrame(audioData, timestamp); updated {
		a.currentSpeechRate = a.rateAnalyzer.GetCurrentRate()
		a.adjustForSpeechRate()
	}

	isSpeech := energy > a.config.Threshold

	a.updatePreRollBuffer(audioData, timestamp)

	switch a.state {
	case StateSilence:
		if isSpeech {
			a.transitionToSpeechPre(timestamp)
		}

	case StateSpeechPre:
		a.appendToBuffer(audioData)
		if isSpeech {
			a.speechFrames++
			if a.speechFrames >= 2 {
				a.transitionToSpeechStart(timestamp)
			}
		} else {
			a.silenceFrames++
			if a.silenceFrames >= 3 {
				a.transitionToSilence()
			}
		}

	case StateSpeechStart:
		a.appendToBuffer(audioData)
		a.speechFrames++
		a.silenceFrames = 0
		a.state = StateSpeechOngoing

	case StateSpeechOngoing:
		a.appendToBuffer(audioData)
		if isSpeech {
			a.speechFrames++
			a.silenceFrames = 0
		} else {
			a.silenceFrames++
			silenceDurationMs := a.silenceFrames * 20

			if silenceDurationMs >= a.config.SilenceDurationMs {
				a.transitionToSpeechPost(timestamp)
			}
		}

	case StateSpeechPost:
		a.appendToBuffer(audioData)
		a.postRollCount++

		if isSpeech {
			a.postRollCount = 0
			a.silenceFrames = 0
			a.state = StateSpeechOngoing
		} else {
			if a.postRollCount >= a.postRollFrames {
				a.transitionToSpeechEnd(timestamp)
			}
		}

	case StateSpeechEnd:
		a.transitionToSilence()
	}

	return a.state, nil
}

func (a *AdaptiveVADDetector) adjustForLanguage() {
	langConfig := language.GetLanguageConfig(a.detectedLanguage)

	a.baseSilenceMs = langConfig.SilenceDurationMs
	a.baseThreshold = langConfig.VADThreshold

	a.config.SilenceDurationMs = a.baseSilenceMs
	a.config.Threshold = a.baseThreshold
}

func (a *AdaptiveVADDetector) adjustForSpeechRate() {
	rate := a.currentSpeechRate
	adjustFactor := 1.0

	if rate < 2.0 {
		adjustFactor = 1.3
	} else if rate < 4.0 {
		adjustFactor = 1.1
	} else if rate < 6.0 {
		adjustFactor = 1.0
	} else if rate < 8.0 {
		adjustFactor = 0.85
	} else {
		adjustFactor = 0.7
	}

	a.config.SilenceDurationMs = int(float64(a.baseSilenceMs) * adjustFactor)
}

func (a *AdaptiveVADDetector) updatePreRollBuffer(audioData []byte, timestamp int64) {
	frame := frameWithTimestamp{
		data:      make([]byte, len(audioData)),
		timestamp: timestamp,
	}
	copy(frame.data, audioData)

	a.preRollBuffer = append(a.preRollBuffer, frame)
	for len(a.preRollBuffer) > a.preRollMaxFrames {
		a.preRollBuffer = a.preRollBuffer[1:]
	}
}

func (a *AdaptiveVADDetector) transitionToSpeechPre(timestamp int64) {
	a.state = StateSpeechPre
	a.speechFrames = 1
	a.silenceFrames = 0
	a.startTime = timestamp
	a.buffer = make([]byte, 0, 64000)

	for _, frame := range a.preRollBuffer {
		a.buffer = append(a.buffer, frame.data...)
	}

	if len(a.preRollBuffer) > 0 {
		a.startTime = a.preRollBuffer[0].timestamp
	}
}

func (a *AdaptiveVADDetector) transitionToSpeechStart(timestamp int64) {
	a.state = StateSpeechStart
}

func (a *AdaptiveVADDetector) transitionToSpeechPost(timestamp int64) {
	a.state = StateSpeechPost
	a.postRollCount = 0
}

func (a *AdaptiveVADDetector) transitionToSpeechEnd(timestamp int64) {
	a.state = StateSpeechEnd
	a.segmentID++

	segmentDurationMs := (a.speechFrames + a.silenceFrames) * 20

	segment := &AudioSegment{
		ID:               a.segmentID,
		Data:             make([]byte, len(a.buffer)),
		StartTime:        a.startTime,
		EndTime:          timestamp,
		Frames:           a.speechFrames + a.silenceFrames,
		StartOffsetBytes: len(a.preRollBuffer) * 640,
		EndOffsetBytes:   a.postRollCount * 640,
		IsMerged:         false,
	}
	copy(segment.Data, a.buffer)

	if segmentDurationMs < a.mergeThresholdMs {
		if a.pendingSegment == nil {
			a.pendingSegment = segment
		} else {
			a.mergeSegments(segment)
		}
	} else {
		if a.pendingSegment != nil {
			a.mergeSegments(segment)
			a.emitPendingSegment()
		} else {
			if a.callback != nil {
				go a.callback(segment)
			}
		}
	}
}

func (a *AdaptiveVADDetector) mergeSegments(newSegment *AudioSegment) {
	if a.pendingSegment == nil {
		a.pendingSegment = newSegment
		return
	}

	mergedData := make([]byte, len(a.pendingSegment.Data)+len(newSegment.Data))
	copy(mergedData, a.pendingSegment.Data)
	copy(mergedData[len(a.pendingSegment.Data):], newSegment.Data)

	a.pendingSegment = &AudioSegment{
		ID:               newSegment.ID,
		Data:             mergedData,
		StartTime:        a.pendingSegment.StartTime,
		EndTime:          newSegment.EndTime,
		Frames:           a.pendingSegment.Frames + newSegment.Frames,
		StartOffsetBytes: a.pendingSegment.StartOffsetBytes,
		EndOffsetBytes:   newSegment.EndOffsetBytes,
		IsMerged:         true,
	}
}

func (a *AdaptiveVADDetector) emitPendingSegment() {
	if a.pendingSegment == nil {
		return
	}

	if a.callback != nil {
		go a.callback(a.pendingSegment)
	}
	a.pendingSegment = nil
}

func (a *AdaptiveVADDetector) transitionToSilence() {
	a.state = StateSilence
	a.speechFrames = 0
	a.silenceFrames = 0
	a.postRollCount = 0
	a.buffer = nil
	a.currentSegment = nil
}

func (a *AdaptiveVADDetector) appendToBuffer(audioData []byte) {
	a.buffer = append(a.buffer, audioData...)
}

func (a *AdaptiveVADDetector) calculateEnergy(audioData []byte) float32 {
	if len(audioData) < 2 {
		return 0
	}

	var sum float64
	sampleCount := len(audioData) / 2

	for i := 0; i < len(audioData); i += 2 {
		if i+1 >= len(audioData) {
			break
		}
		sample := int16(audioData[i]) | (int16(audioData[i+1]) << 8)
		sum += float64(sample) * float64(sample)
	}

	if sampleCount == 0 {
		return 0
	}

	return float32(sum / float64(sampleCount))
}

func (a *AdaptiveVADDetector) Flush(timestamp int64) *AudioSegment {
	a.mu.Lock()
	defer a.mu.Unlock()

	if a.pendingSegment != nil {
		segment := a.pendingSegment
		a.pendingSegment = nil
		if a.callback != nil {
			go a.callback(segment)
		}
		return segment
	}

	if a.state == StateSilence || len(a.buffer) == 0 {
		return nil
	}

	a.segmentID++
	segment := &AudioSegment{
		ID:               a.segmentID,
		Data:             make([]byte, len(a.buffer)),
		StartTime:        a.startTime,
		EndTime:          timestamp,
		Frames:           a.speechFrames + a.silenceFrames,
		StartOffsetBytes: len(a.preRollBuffer) * 640,
		EndOffsetBytes:   a.postRollCount * 640,
		IsMerged:         false,
	}
	copy(segment.Data, a.buffer)

	a.transitionToSilence()

	if a.callback != nil {
		go a.callback(segment)
	}

	return segment
}

func (a *AdaptiveVADDetector) Reset() {
	a.mu.Lock()
	defer a.mu.Unlock()

	a.transitionToSilence()
	a.segmentID = 0
	a.pendingSegment = nil
	a.preRollBuffer = make([]frameWithTimestamp, 0, 50)
	a.langDetector.Reset()
	a.rateAnalyzer.Reset()
	a.detectedLanguage = ""
	a.detectedLangConf = 0
	a.currentSpeechRate = 0
}

func (a *AdaptiveVADDetector) GetState() VADState {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.state
}

func (a *AdaptiveVADDetector) GetDetectedLanguage() (language.Language, float32) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.detectedLanguage, a.detectedLangConf
}

func (a *AdaptiveVADDetector) GetSpeechRate() float64 {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.currentSpeechRate
}

func (a *AdaptiveVADDetector) GetSilencePrediction() (probability float64, confidence float64) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.silencePredictor.PredictNextSilence()
}

func (a *AdaptiveVADDetector) UpdateConfig(profile config_manager.VADProfile) {
	a.mu.Lock()
	defer a.mu.Unlock()

	a.config.PreRollMs = profile.PreRollMs
	a.config.PostRollMs = profile.PostRollMs
	a.config.SilenceDurationMs = profile.SilenceDurationMs
	a.config.MinSegmentMs = profile.MinSegmentMs
	a.config.Threshold = profile.Threshold
	a.currentProfile = profile.Name

	a.preRollMaxFrames = (profile.PreRollMs * a.config.SampleRate / 1000) / 640
	a.postRollFrames = (profile.PostRollMs + 19) / 20
	a.mergeThresholdMs = profile.MinSegmentMs
	a.baseSilenceMs = profile.SilenceDurationMs
	a.baseThreshold = profile.Threshold
}

func (a *AdaptiveVADDetector) GetConfig() VADConfig {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.config
}

func (a *AdaptiveVADDetector) GetCurrentProfile() string {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.currentProfile
}

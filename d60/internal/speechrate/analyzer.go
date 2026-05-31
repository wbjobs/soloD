package speechrate

import (
	"math"
	"sync"
	"time"
)

type SyllableEvent struct {
	Timestamp int64
	Energy    float64
	IsSyllable bool
}

type RateUpdate struct {
	SyllablesPerSecond float64
	Timestamp         time.Time
	DurationMs        int64
	SyllableCount     int
	PredictedSilenceMs int
}

type SpeechRateAnalyzer struct {
	sampleRate       int
	updateIntervalMs int

	energyBuffer     []float64
	energyBufferSize int

	syllableEvents   []SyllableEvent
	syllableWindowMs int

	lastUpdateTime   int64
	currentSyllableCount int

	smoothedRate     float64
	alphaSmoothing   float64

	mu               sync.RWMutex
	callback         func(*RateUpdate)

	thresholdUp      float64
	thresholdDown    float64
	inPeak           bool
	peakMinDistance  int
	lastPeakSample   int
	sampleCount      int

	baselineEnergy   float64
}

func NewSpeechRateAnalyzer(sampleRate int) *SpeechRateAnalyzer {
	return &SpeechRateAnalyzer{
		sampleRate:       sampleRate,
		updateIntervalMs: 200,
		energyBufferSize: (sampleRate * 2 * 200) / 1000,
		energyBuffer:     make([]float64, 0, 1000),
		syllableEvents:   make([]SyllableEvent, 0, 100),
		syllableWindowMs: 1000,
		alphaSmoothing:   0.3,
		smoothedRate:     4.0,
		thresholdUp:      1.5,
		thresholdDown:    0.7,
		peakMinDistance:  3,
		baselineEnergy:   1.0,
	}
}

func (a *SpeechRateAnalyzer) SetCallback(callback func(*RateUpdate)) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.callback = callback
}

func (a *SpeechRateAnalyzer) ProcessFrame(audioData []byte, timestamp int64) (*RateUpdate, bool) {
	a.mu.Lock()
	defer a.mu.Unlock()

	energy := a.calculateEnergy(audioData)
	a.energyBuffer = append(a.energyBuffer, energy)
	a.sampleCount++

	if len(a.energyBuffer) > a.energyBufferSize {
		a.energyBuffer = a.energyBuffer[1:]
	}

	a.detectSyllablePeak(energy, timestamp)

	a.updateBaseline(energy)

	if timestamp-a.lastUpdateTime >= int64(a.updateIntervalMs) {
		rate := a.calculateSpeechRate(timestamp)
		a.lastUpdateTime = timestamp

		update := &RateUpdate{
			SyllablesPerSecond: rate,
			Timestamp:         time.Now(),
			DurationMs:        timestamp - a.lastUpdateTime,
			SyllableCount:     a.currentSyllableCount,
			PredictedSilenceMs: a.predictSilenceDuration(rate),
		}

		if a.callback != nil {
			go a.callback(update)
		}

		return update, true
	}

	return nil, false
}

func (a *SpeechRateAnalyzer) calculateEnergy(audioData []byte) float64 {
	if len(audioData) < 2 {
		return 0
	}

	var sum float64
	samples := len(audioData) / 2

	for i := 0; i < len(audioData); i += 2 {
		if i+1 >= len(audioData) {
			break
		}
		sample := int16(audioData[i]) | (int16(audioData[i+1]) << 8)
		sum += float64(sample) * float64(sample)
	}

	return sum / float64(samples)
}

func (a *SpeechRateAnalyzer) detectSyllablePeak(energy float64, timestamp int64) {
	if a.baselineEnergy == 0 {
		a.baselineEnergy = energy
		return
	}

	normalizedEnergy := energy / a.baselineEnergy

	if !a.inPeak && normalizedEnergy > a.thresholdUp {
		if a.sampleCount-a.lastPeakSample >= a.peakMinDistance {
			a.syllableEvents = append(a.syllableEvents, SyllableEvent{
				Timestamp: timestamp,
				Energy:    energy,
				IsSyllable: true,
			})
			a.currentSyllableCount++
			a.lastPeakSample = a.sampleCount
		}
		a.inPeak = true
	} else if a.inPeak && normalizedEnergy < a.thresholdDown {
		a.inPeak = false
	}

	cutoffTime := timestamp - int64(a.syllableWindowMs)
	for len(a.syllableEvents) > 0 && a.syllableEvents[0].Timestamp < cutoffTime {
		a.syllableEvents = a.syllableEvents[1:]
	}
}

func (a *SpeechRateAnalyzer) updateBaseline(energy float64) {
	if energy > 0 {
		a.baselineEnergy = 0.99*a.baselineEnergy + 0.01*energy
	}
}

func (a *SpeechRateAnalyzer) calculateSpeechRate(timestamp int64) float64 {
	if len(a.syllableEvents) < 2 {
		return a.smoothedRate
	}

	firstEvent := a.syllableEvents[0]
	lastEvent := a.syllableEvents[len(a.syllableEvents)-1]

	durationSec := float64(lastEvent.Timestamp-firstEvent.Timestamp) / 1000.0
	if durationSec < 0.1 {
		return a.smoothedRate
	}

	rate := float64(len(a.syllableEvents)) / durationSec

	a.smoothedRate = a.alphaSmoothing*rate + (1-a.alphaSmoothing)*a.smoothedRate

	return a.smoothedRate
}

func (a *SpeechRateAnalyzer) predictSilenceDuration(syllablesPerSecond float64) int {
	baseSilenceMs := 300.0

	if syllablesPerSecond < 2.0 {
		return int(baseSilenceMs * 1.3)
	} else if syllablesPerSecond < 4.0 {
		return int(baseSilenceMs * 1.1)
	} else if syllablesPerSecond < 6.0 {
		return int(baseSilenceMs)
	} else if syllablesPerSecond < 8.0 {
		return int(baseSilenceMs * 0.85)
	} else {
		return int(baseSilenceMs * 0.7)
	}
}

func (a *SpeechRateAnalyzer) GetCurrentRate() float64 {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.smoothedRate
}

func (a *SpeechRateAnalyzer) GetPredictedSilenceMs() int {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.predictSilenceDuration(a.smoothedRate)
}

func (a *SpeechRateAnalyzer) Reset() {
	a.mu.Lock()
	defer a.mu.Unlock()

	a.energyBuffer = make([]float64, 0, 1000)
	a.syllableEvents = make([]SyllableEvent, 0, 100)
	a.lastUpdateTime = 0
	a.currentSyllableCount = 0
	a.smoothedRate = 4.0
	a.inPeak = false
	a.lastPeakSample = 0
	a.sampleCount = 0
	a.baselineEnergy = 1.0
}

type SilencePredictor struct {
	energyHistory []float64
	vadHistory    []int
	windowSize    int
	predictionHorizon int
	mu            sync.RWMutex
}

func NewSilencePredictor(windowSize int) *SilencePredictor {
	return &SilencePredictor{
		energyHistory: make([]float64, 0, windowSize),
		vadHistory:    make([]int, 0, windowSize),
		windowSize:    windowSize,
		predictionHorizon: 10,
	}
}

func (p *SilencePredictor) Update(energy float64, vadState int) {
	p.mu.Lock()
	defer p.mu.Unlock()

	p.energyHistory = append(p.energyHistory, energy)
	p.vadHistory = append(p.vadHistory, vadState)

	for len(p.energyHistory) > p.windowSize {
		p.energyHistory = p.energyHistory[1:]
		p.vadHistory = p.vadHistory[1:]
	}
}

func (p *SilencePredictor) PredictNextSilence() (probability float64, confidence float64) {
	p.mu.RLock()
	defer p.mu.RUnlock()

	if len(p.vadHistory) < 5 {
		return 0.5, 0.3
	}

	silenceCount := 0
	for _, state := range p.vadHistory[len(p.vadHistory)-5:] {
		if state == 0 {
			silenceCount++
		}
	}

	recentSilenceRatio := float64(silenceCount) / 5.0

	energyTrend := p.calculateEnergyTrend()

	probability = 0.6*recentSilenceRatio + 0.4*energyTrend
	confidence = math.Min(1.0, float64(len(p.vadHistory))/float64(p.windowSize))

	return probability, confidence
}

func (p *SilencePredictor) calculateEnergyTrend() float64 {
	if len(p.energyHistory) < 10 {
		return 0.5
	}

	recent := p.energyHistory[len(p.energyHistory)-5:]
	older := p.energyHistory[len(p.energyHistory)-10: len(p.energyHistory)-5]

	recentAvg := average(recent)
	olderAvg := average(older)

	if olderAvg == 0 {
		return 0.5
	}

	ratio := recentAvg / olderAvg

	if ratio < 0.5 {
		return 0.9
	} else if ratio < 0.8 {
		return 0.7
	} else if ratio < 1.0 {
		return 0.5
	} else {
		return 0.3
	}
}

func average(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}

	sum := 0.0
	for _, v := range values {
		sum += v
	}
	return sum / float64(len(values))
}

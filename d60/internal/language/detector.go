package language

import (
	"math"
	"sync"
	"time"
)

type Language string

const (
	LanguageChinese  Language = "zh"
	LanguageEnglish  Language = "en"
	LanguageJapanese Language = "ja"
	LanguageUnknown  Language = "unknown"
)

type LanguageConfig struct {
	SilenceDurationMs int
	VADThreshold      float32
}

var LanguageDefaults = map[Language]LanguageConfig{
	LanguageChinese: {
		SilenceDurationMs: 260,
		VADThreshold:      0.45,
	},
	LanguageEnglish: {
		SilenceDurationMs: 320,
		VADThreshold:      0.50,
	},
	LanguageJapanese: {
		SilenceDurationMs: 350,
		VADThreshold:      0.55,
	},
	LanguageUnknown: {
		SilenceDurationMs: 300,
		VADThreshold:      0.50,
	},
}

type AudioFeature struct {
	ZCR          float64
	Energy       float64
	SpectralCentroid float64
	BandEnergy   []float64
}

type DetectionResult struct {
	Language       Language
	Confidence     float32
	DurationMs     int64
	DetectedAt     time.Time
	Features       *AudioFeature
}

type LanguageDetector struct {
	buffer          []byte
	sampleRate      int
	maxBufferMs     int
	currentMs       int
	detected        bool
	result          *DetectionResult
	featureWindow   []*AudioFeature
	windowSize      int
	mu              sync.RWMutex
	callback        func(*DetectionResult)
}

func NewLanguageDetector(sampleRate int) *LanguageDetector {
	return &LanguageDetector{
		buffer:        make([]byte, 0, sampleRate*4),
		sampleRate:    sampleRate,
		maxBufferMs:   2000,
		featureWindow: make([]*AudioFeature, 0, 50),
		windowSize:    10,
	}
}

func (d *LanguageDetector) SetCallback(callback func(*DetectionResult)) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.callback = callback
}

func (d *LanguageDetector) ProcessFrame(audioData []byte, timestamp int64) (*DetectionResult, bool) {
	d.mu.Lock()
	defer d.mu.Unlock()

	if d.detected {
		return d.result, true
	}

	d.buffer = append(d.buffer, audioData...)
	frameMs := len(audioData) * 1000 / (d.sampleRate * 2)
	d.currentMs += frameMs

	features := d.extractFeatures(audioData)
	d.featureWindow = append(d.featureWindow, features)
	if len(d.featureWindow) > d.windowSize {
		d.featureWindow = d.featureWindow[1:]
	}

	if d.currentMs >= d.maxBufferMs {
		result := d.detectLanguage()
		d.detected = true
		d.result = result

		if d.callback != nil {
			go d.callback(result)
		}

		return result, true
	}

	return nil, false
}

func (d *LanguageDetector) extractFeatures(audioData []byte) *AudioFeature {
	if len(audioData) < 2 {
		return &AudioFeature{ZCR: 0, Energy: 0, SpectralCentroid: 0}
	}

	samples := len(audioData) / 2
	var energy float64
	var zcr int
	var prevSample int16

	for i := 0; i < len(audioData); i += 2 {
		if i+1 >= len(audioData) {
			break
		}
		sample := int16(audioData[i]) | (int16(audioData[i+1]) << 8)
		energy += float64(sample) * float64(sample)

		if i > 0 && (sample >= 0 && prevSample < 0 || sample < 0 && prevSample >= 0) {
			zcr++
		}
		prevSample = sample
	}

	energy = energy / float64(samples)
	normalizedZCR := float64(zcr) / float64(samples) * 1000

	bandCount := 8
	bandEnergy := make([]float64, bandCount)
	samplesPerBand := samples / bandCount

	for band := 0; band < bandCount; band++ {
		var bandSum float64
		start := band * samplesPerBand
		end := start + samplesPerBand
		for i := start; i < end && i*2 < len(audioData); i++ {
			sample := int16(audioData[i*2]) | (int16(audioData[i*2+1]) << 8)
			bandSum += float64(sample) * float64(sample)
		}
		bandEnergy[band] = bandSum / float64(samplesPerBand)
	}

	var centroid float64
	var totalEnergy float64
	for i, e := range bandEnergy {
		centroid += float64(i) * e
		totalEnergy += e
	}
	if totalEnergy > 0 {
		centroid /= totalEnergy
	}

	return &AudioFeature{
		ZCR:              normalizedZCR,
		Energy:           energy,
		SpectralCentroid: centroid,
		BandEnergy:       bandEnergy,
	}
}

func (d *LanguageDetector) detectLanguage() *DetectionResult {
	avgZCR := d.avgZCR()
	avgEnergy := d.avgEnergy()
	avgCentroid := d.avgCentroid()

	zhScore := d.calculateScore(avgZCR, avgEnergy, avgCentroid, LanguageChinese)
	enScore := d.calculateScore(avgZCR, avgEnergy, avgCentroid, LanguageEnglish)
	jaScore := d.calculateScore(avgZCR, avgEnergy, avgCentroid, LanguageJapanese)

	totalScore := zhScore + enScore + jaScore
	if totalScore == 0 {
		return &DetectionResult{
			Language:   LanguageUnknown,
			Confidence: 0.33,
			DurationMs: int64(d.currentMs),
			DetectedAt: time.Now(),
		}
	}

	var detectedLang Language
	var maxConfidence float32

	zhConf := float32(zhScore / totalScore)
	enConf := float32(enScore / totalScore)
	jaConf := float32(jaScore / totalScore)

	switch {
	case zhConf >= enConf && zhConf >= jaConf:
		detectedLang = LanguageChinese
		maxConfidence = zhConf
	case enConf >= zhConf && enConf >= jaConf:
		detectedLang = LanguageEnglish
		maxConfidence = enConf
	default:
		detectedLang = LanguageJapanese
		maxConfidence = jaConf
	}

	return &DetectionResult{
		Language:   detectedLang,
		Confidence: maxConfidence,
		DurationMs: int64(d.currentMs),
		DetectedAt: time.Now(),
		Features: &AudioFeature{
			ZCR:              avgZCR,
			Energy:           avgEnergy,
			SpectralCentroid: avgCentroid,
		},
	}
}

func (d *LanguageDetector) calculateScore(zcr, energy, centroid float64, lang Language) float64 {
	switch lang {
	case LanguageChinese:
		zcrScore := gaussian(zcr, 50, 20)
		centroidScore := gaussian(centroid, 3.5, 1.5)
		return zcrScore*0.5 + centroidScore*0.5

	case LanguageEnglish:
		zcrScore := gaussian(zcr, 35, 15)
		centroidScore := gaussian(centroid, 3.0, 1.5)
		return zcrScore*0.5 + centroidScore*0.5

	case LanguageJapanese:
		zcrScore := gaussian(zcr, 25, 12)
		centroidScore := gaussian(centroid, 2.5, 1.2)
		return zcrScore*0.5 + centroidScore*0.5

	default:
		return 0.33
	}
}

func gaussian(x, mean, std float64) float64 {
	return math.Exp(-(x-mean)*(x-mean)/(2*std*std)) / (std * math.Sqrt(2*math.Pi))
}

func (d *LanguageDetector) avgZCR() float64 {
	if len(d.featureWindow) == 0 {
		return 0
	}
	var sum float64
	for _, f := range d.featureWindow {
		sum += f.ZCR
	}
	return sum / float64(len(d.featureWindow))
}

func (d *LanguageDetector) avgEnergy() float64 {
	if len(d.featureWindow) == 0 {
		return 0
	}
	var sum float64
	for _, f := range d.featureWindow {
		sum += f.Energy
	}
	return sum / float64(len(d.featureWindow))
}

func (d *LanguageDetector) avgCentroid() float64 {
	if len(d.featureWindow) == 0 {
		return 0
	}
	var sum float64
	for _, f := range d.featureWindow {
		sum += f.SpectralCentroid
	}
	return sum / float64(len(d.featureWindow))
}

func (d *LanguageDetector) Reset() {
	d.mu.Lock()
	defer d.mu.Unlock()

	d.buffer = make([]byte, 0, d.sampleRate*4)
	d.currentMs = 0
	d.detected = false
	d.result = nil
	d.featureWindow = make([]*AudioFeature, 0, 50)
}

func (d *LanguageDetector) IsDetected() bool {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.detected
}

func (d *LanguageDetector) GetResult() *DetectionResult {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.result
}

func GetLanguageConfig(lang Language) LanguageConfig {
	if cfg, exists := LanguageDefaults[lang]; exists {
		return cfg
	}
	return LanguageDefaults[LanguageUnknown]
}

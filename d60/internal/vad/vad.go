package vad

import (
	"errors"
	"sync"
	"time"
)

type VADState int

const (
	StateSilence VADState = iota
	StateSpeechPre
	StateSpeechStart
	StateSpeechOngoing
	StateSpeechPost
	StateSpeechEnd
)

const (
	DefaultPreRollMs   = 200
	DefaultPostRollMs  = 150
	DefaultMinSegmentMs = 800
)

type frameWithTimestamp struct {
	data      []byte
	timestamp int64
}

type VADConfig struct {
	Aggressiveness    int
	SilenceDurationMs int
	Threshold         float32
	SampleRate        int
	PreRollMs         int
	PostRollMs        int
	MinSegmentMs      int
}

type AudioSegment struct {
	ID               int64
	Data             []byte
	StartTime        int64
	EndTime          int64
	Frames           int
	StartOffsetBytes int
	EndOffsetBytes   int
	IsMerged         bool
}

type frameWithTimestamp struct {
	data      []byte
	timestamp int64
}

type VADDetector struct {
	config             VADConfig
	state              VADState
	buffer             []byte
	currentSegment     *AudioSegment
	silenceFrames      int
	speechFrames       int
	segmentID          int64
	startTime          int64
	mu                 sync.RWMutex
	callback           func(*AudioSegment)
	
	preRollBuffer      []frameWithTimestamp
	preRollMaxFrames   int
	postRollFrames     int
	postRollCount      int
	
	pendingSegment     *AudioSegment
	mergeThresholdMs   int
}

func NewVADDetector(config VADConfig) *VADDetector {
	if config.Aggressiveness < 0 || config.Aggressiveness > 3 {
		config.Aggressiveness = 2
	}
	if config.SilenceDurationMs <= 0 {
		config.SilenceDurationMs = 300
	}
	if config.SampleRate == 0 {
		config.SampleRate = 16000
	}
	if config.Threshold <= 0 {
		config.Threshold = 0.5
	}
	if config.PreRollMs <= 0 {
		config.PreRollMs = DefaultPreRollMs
	}
	if config.PostRollMs <= 0 {
		config.PostRollMs = DefaultPostRollMs
	}
	if config.MinSegmentMs <= 0 {
		config.MinSegmentMs = DefaultMinSegmentMs
	}

	bytesPerMs := config.SampleRate * 2 / 1000
	preRollMaxFrames := (config.PreRollMs * bytesPerMs) / 640
	if preRollMaxFrames < 1 {
		preRollMaxFrames = 10
	}

	return &VADDetector{
		config:           config,
		state:            StateSilence,
		segmentID:        0,
		preRollBuffer:    make([]frameWithTimestamp, 0, preRollMaxFrames),
		preRollMaxFrames: preRollMaxFrames,
		postRollFrames:   (config.PostRollMs + 19) / 20,
		mergeThresholdMs: config.MinSegmentMs,
	}
}

func (v *VADDetector) SetCallback(callback func(*AudioSegment)) {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.callback = callback
}

func (v *VADDetector) UpdateConfig(config VADConfig) {
	v.mu.Lock()
	defer v.mu.Unlock()
	if config.Aggressiveness >= 0 && config.Aggressiveness <= 3 {
		v.config.Aggressiveness = config.Aggressiveness
	}
	if config.SilenceDurationMs > 0 {
		v.config.SilenceDurationMs = config.SilenceDurationMs
	}
	if config.Threshold > 0 {
		v.config.Threshold = config.Threshold
	}
	if config.SampleRate > 0 {
		v.config.SampleRate = config.SampleRate
	}
	if config.PreRollMs > 0 {
		v.config.PreRollMs = config.PreRollMs
		bytesPerMs := config.SampleRate * 2 / 1000
		v.preRollMaxFrames = (config.PreRollMs * bytesPerMs) / 640
		if v.preRollMaxFrames < 1 {
			v.preRollMaxFrames = 10
		}
	}
	if config.PostRollMs > 0 {
		v.config.PostRollMs = config.PostRollMs
		v.postRollFrames = (config.PostRollMs + 19) / 20
	}
	if config.MinSegmentMs > 0 {
		v.config.MinSegmentMs = config.MinSegmentMs
		v.mergeThresholdMs = config.MinSegmentMs
	}
}

func (v *VADDetector) GetConfig() VADConfig {
	v.mu.RLock()
	defer v.mu.RUnlock()
	return v.config
}

func (v *VADDetector) GetState() VADState {
	v.mu.RLock()
	defer v.mu.RUnlock()
	return v.state
}

func (v *VADDetector) ProcessFrame(audioData []byte, timestamp int64) (VADState, error) {
	v.mu.Lock()
	defer v.mu.Unlock()

	if len(audioData) == 0 {
		return v.state, errors.New("empty audio data")
	}

	isSpeech := v.detectSpeech(audioData)

	v.updatePreRollBuffer(audioData, timestamp)

	switch v.state {
	case StateSilence:
		if isSpeech {
			v.transitionToSpeechPre(timestamp)
		}

	case StateSpeechPre:
		v.appendToBuffer(audioData)
		if isSpeech {
			v.speechFrames++
			if v.speechFrames >= 2 {
				v.transitionToSpeechStart(timestamp)
			}
		} else {
			v.silenceFrames++
			if v.silenceFrames >= 3 {
				v.transitionToSilence()
			}
		}

	case StateSpeechStart:
		v.appendToBuffer(audioData)
		v.speechFrames++
		v.silenceFrames = 0
		v.state = StateSpeechOngoing

	case StateSpeechOngoing:
		v.appendToBuffer(audioData)
		if isSpeech {
			v.speechFrames++
			v.silenceFrames = 0
		} else {
			v.silenceFrames++
			silenceDurationMs := v.silenceFrames * 20

			if silenceDurationMs >= v.config.SilenceDurationMs {
				v.transitionToSpeechPost(timestamp)
			}
		}

	case StateSpeechPost:
		v.appendToBuffer(audioData)
		v.postRollCount++
		
		if isSpeech {
			v.postRollCount = 0
			v.silenceFrames = 0
			v.state = StateSpeechOngoing
		} else {
			if v.postRollCount >= v.postRollFrames {
				v.transitionToSpeechEnd(timestamp)
			}
		}

	case StateSpeechEnd:
		v.transitionToSilence()
	}

	return v.state, nil
}

func (v *VADDetector) updatePreRollBuffer(audioData []byte, timestamp int64) {
	frame := frameWithTimestamp{
		data:      make([]byte, len(audioData)),
		timestamp: timestamp,
	}
	copy(frame.data, audioData)

	v.preRollBuffer = append(v.preRollBuffer, frame)
	for len(v.preRollBuffer) > v.preRollMaxFrames {
		v.preRollBuffer = v.preRollBuffer[1:]
	}
}

func (v *VADDetector) detectSpeech(audioData []byte) bool {
	energy := v.calculateEnergy(audioData)
	return energy > v.config.Threshold
}

func (v *VADDetector) calculateEnergy(audioData []byte) float32 {
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

func (v *VADDetector) transitionToSpeechPre(timestamp int64) {
	v.state = StateSpeechPre
	v.speechFrames = 1
	v.silenceFrames = 0
	v.startTime = timestamp
	v.buffer = make([]byte, 0, 64000)

	for _, frame := range v.preRollBuffer {
		v.buffer = append(v.buffer, frame.data...)
	}

	if len(v.preRollBuffer) > 0 {
		v.startTime = v.preRollBuffer[0].timestamp
	}
}

func (v *VADDetector) transitionToSpeechStart(timestamp int64) {
	v.state = StateSpeechStart
}

func (v *VADDetector) transitionToSpeechPost(timestamp int64) {
	v.state = StateSpeechPost
	v.postRollCount = 0
}

func (v *VADDetector) transitionToSpeechEnd(timestamp int64) {
	v.state = StateSpeechEnd
	v.segmentID++

	segmentDurationMs := (v.speechFrames + v.silenceFrames) * 20

	segment := &AudioSegment{
		ID:               v.segmentID,
		Data:             make([]byte, len(v.buffer)),
		StartTime:        v.startTime,
		EndTime:          timestamp,
		Frames:           v.speechFrames + v.silenceFrames,
		StartOffsetBytes: len(v.preRollBuffer) * 640,
		EndOffsetBytes:   v.postRollCount * 640,
		IsMerged:         false,
	}
	copy(segment.Data, v.buffer)

	if segmentDurationMs < v.mergeThresholdMs {
		if v.pendingSegment == nil {
			v.pendingSegment = segment
		} else {
			v.mergeSegments(segment)
		}
	} else {
		if v.pendingSegment != nil {
			v.mergeSegments(segment)
			v.emitPendingSegment()
		} else {
			if v.callback != nil {
				go v.callback(segment)
			}
		}
	}
}

func (v *VADDetector) mergeSegments(newSegment *AudioSegment) {
	if v.pendingSegment == nil {
		v.pendingSegment = newSegment
		return
	}

	mergedData := make([]byte, len(v.pendingSegment.Data)+len(newSegment.Data))
	copy(mergedData, v.pendingSegment.Data)
	copy(mergedData[len(v.pendingSegment.Data):], newSegment.Data)

	v.pendingSegment = &AudioSegment{
		ID:               newSegment.ID,
		Data:             mergedData,
		StartTime:        v.pendingSegment.StartTime,
		EndTime:          newSegment.EndTime,
		Frames:           v.pendingSegment.Frames + newSegment.Frames,
		StartOffsetBytes: v.pendingSegment.StartOffsetBytes,
		EndOffsetBytes:   newSegment.EndOffsetBytes,
		IsMerged:         true,
	}
}

func (v *VADDetector) emitPendingSegment() {
	if v.pendingSegment == nil {
		return
	}

	if v.callback != nil {
		go v.callback(v.pendingSegment)
	}
	v.pendingSegment = nil
}

func (v *VADDetector) transitionToSilence() {
	v.state = StateSilence
	v.speechFrames = 0
	v.silenceFrames = 0
	v.postRollCount = 0
	v.buffer = nil
	v.currentSegment = nil
}

func (v *VADDetector) appendToBuffer(audioData []byte) {
	v.buffer = append(v.buffer, audioData...)
}

func (v *VADDetector) Flush(timestamp int64) *AudioSegment {
	v.mu.Lock()
	defer v.mu.Unlock()

	if v.pendingSegment != nil {
		segment := v.pendingSegment
		v.pendingSegment = nil
		if v.callback != nil {
			go v.callback(segment)
		}
		return segment
	}

	if v.state == StateSilence || len(v.buffer) == 0 {
		return nil
	}

	v.segmentID++
	segment := &AudioSegment{
		ID:               v.segmentID,
		Data:             make([]byte, len(v.buffer)),
		StartTime:        v.startTime,
		EndTime:          timestamp,
		Frames:           v.speechFrames + v.silenceFrames,
		StartOffsetBytes: len(v.preRollBuffer) * 640,
		EndOffsetBytes:   v.postRollCount * 640,
		IsMerged:         false,
	}
	copy(segment.Data, v.buffer)

	v.transitionToSilence()

	if v.callback != nil {
		go v.callback(segment)
	}

	return segment
}

func (v *VADDetector) Reset() {
	v.mu.Lock()
	defer v.mu.Unlock()
	v.transitionToSilence()
	v.segmentID = 0
	v.pendingSegment = nil
	v.preRollBuffer = make([]frameWithTimestamp, 0, v.preRollMaxFrames)
}

func (s VADState) String() string {
	switch s {
	case StateSilence:
		return "SILENCE"
	case StateSpeechPre:
		return "SPEECH_PRE"
	case StateSpeechStart:
		return "SPEECH_START"
	case StateSpeechOngoing:
		return "SPEECH_ONGOING"
	case StateSpeechPost:
		return "SPEECH_POST"
	case StateSpeechEnd:
		return "SPEECH_END"
	default:
		return "UNKNOWN"
	}
}

func (v *VADDetector) ConvertToPCM(opusData []byte) ([]byte, error) {
	return opusData, nil
}

type SilenceTrimmer struct {
	threshold    float32
	minSilenceMs int
}

func NewSilenceTrimmer(threshold float32, minSilenceMs int) *SilenceTrimmer {
	return &SilenceTrimmer{
		threshold:    threshold,
		minSilenceMs: minSilenceMs,
	}
}

func (st *SilenceTrimmer) Trim(audioData []byte, sampleRate int) ([]byte, int, int) {
	if len(audioData) < 2 {
		return audioData, 0, 0
	}

	frameSize := 640
	startOffset := 0
	endOffset := len(audioData)

	startFound := false
	endFound := false

	for i := 0; i+frameSize <= len(audioData); i += frameSize {
		energy := st.calculateFrameEnergy(audioData[i:i+frameSize])
		if energy > st.threshold {
			startOffset = max(0, i - frameSize * 3)
			startFound = true
			break
		}
	}

	for i := len(audioData) - frameSize; i >= 0; i -= frameSize {
		if i < startOffset {
			break
		}
		energy := st.calculateFrameEnergy(audioData[i:i+frameSize])
		if energy > st.threshold {
			endOffset = min(len(audioData), i + frameSize + frameSize * 2)
			endFound = true
			break
		}
	}

	if !startFound || !endFound {
		return audioData, 0, len(audioData)
	}

	if endOffset <= startOffset {
		return audioData, 0, len(audioData)
	}

	return audioData[startOffset:endOffset], startOffset / 2, (len(audioData) - endOffset) / 2
}

func (st *SilenceTrimmer) calculateFrameEnergy(frame []byte) float32 {
	var sum float64
	for i := 0; i < len(frame); i += 2 {
		if i+1 >= len(frame) {
			break
		}
		sample := int16(frame[i]) | (int16(frame[i+1]) << 8)
		sum += float64(sample) * float64(sample)
	}
	return float32(sum / float64(len(frame)/2))
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

package websocket

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"voice-translation-gateway/internal/audio"
	"voice-translation-gateway/internal/vad"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024 * 1024,
	WriteBufferSize: 1024 * 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type ClientMessageType int

const (
	MsgTypeAudio ClientMessageType = iota
	MsgTypeConfig
	MsgTypeControl
)

type ServerMessageType int

const (
	RespTypeTranscript ServerMessageType = iota
	RespTypeTranslation
	RespTypeVADStatus
	RespTypeError
)

type ClientMessage struct {
	Type    string          `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type AudioMessage struct {
	Data      []byte `json:"data"`
	Codec     string `json:"codec"`
	SampleRate int32 `json:"sampleRate"`
	Channels  int32 `json:"channels"`
	Timestamp int64  `json:"timestamp"`
}

type ConfigMessage struct {
	SourceLang     string  `json:"sourceLang"`
	TargetLang     string  `json:"targetLang"`
	ASRProvider    string  `json:"asrProvider"`
	MTProvider     string  `json:"mtProvider"`
	VADAggressiveness int  `json:"vadAggressiveness,omitempty"`
	VADSilenceMs   int     `json:"vadSilenceMs,omitempty"`
	VADThreshold   float32 `json:"vadThreshold,omitempty"`
	VADPreRollMs   int     `json:"vadPreRollMs,omitempty"`
	VADPostRollMs  int     `json:"vadPostRollMs,omitempty"`
	VADMinSegmentMs int    `json:"vadMinSegmentMs,omitempty"`
}

type ControlMessage struct {
	Action string `json:"action"`
}

type ServerMessage struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

type TranscriptPayload struct {
	SegmentID  int64   `json:"segmentId"`
	Text       string  `json:"text"`
	IsFinal    bool    `json:"isFinal"`
	Confidence float32 `json:"confidence"`
	StartTime  int64   `json:"startTime"`
	EndTime    int64   `json:"endTime"`
}

type TranslationPayload struct {
	SegmentID      int64  `json:"segmentId"`
	SourceText     string `json:"sourceText"`
	TranslatedText string `json:"translatedText"`
	TargetLang     string `json:"targetLang"`
	IsFinal        bool   `json:"isFinal"`
}

type VADStatusPayload struct {
	State     string `json:"state"`
	Timestamp int64  `json:"timestamp"`
}

type ErrorPayload struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Details string `json:"details,omitempty"`
}

type Session struct {
	ID         string
	conn       *websocket.Conn
	detector   *vad.VADDetector
	sequencer  *audio.Sequencer
	config     *ConfigMessage
	sendChan   chan ServerMessage
	closeChan  chan struct{}
	once       sync.Once
}

type Server struct {
	sessions map[string]*Session
	mu       sync.RWMutex
}

func NewServer() *Server {
	return &Server{
		sessions: make(map[string]*Session),
	}
}

func (s *Server) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	sessionID := r.URL.Query().Get("sessionId")
	if sessionID == "" {
		sessionID = generateSessionID()
	}

	session := &Session{
		ID:        sessionID,
		conn:      conn,
		sendChan:  make(chan ServerMessage, 100),
		closeChan: make(chan struct{}),
	}

	s.mu.Lock()
	s.sessions[sessionID] = session
	s.mu.Unlock()

	go session.handleSend()
	go session.handleReceive()
}

func (s *Session) handleReceive() {
	defer s.Close()

	for {
		select {
		case <-s.closeChan:
			return
		default:
			_, msg, err := s.conn.ReadMessage()
			if err != nil {
				return
			}

			var clientMsg ClientMessage
			if err := json.Unmarshal(msg, &clientMsg); err != nil {
				s.sendError(400, "Invalid message format", err.Error())
				continue
			}

			s.handleMessage(&clientMsg)
		}
	}
}

func (s *Session) handleMessage(msg *ClientMessage) {
	switch msg.Type {
	case "audio":
		var audioMsg AudioMessage
		if err := json.Unmarshal(msg.Payload, &audioMsg); err != nil {
			s.sendError(400, "Invalid audio message", err.Error())
			return
		}
		s.handleAudio(&audioMsg)

	case "config":
		var configMsg ConfigMessage
		if err := json.Unmarshal(msg.Payload, &configMsg); err != nil {
			s.sendError(400, "Invalid config message", err.Error())
			return
		}
		s.handleConfig(&configMsg)

	case "control":
		var controlMsg ControlMessage
		if err := json.Unmarshal(msg.Payload, &controlMsg); err != nil {
			s.sendError(400, "Invalid control message", err.Error())
			return
		}
		s.handleControl(&controlMsg)

	default:
		s.sendError(400, "Unknown message type", msg.Type)
	}
}

func (s *Session) handleAudio(audioMsg *AudioMessage) {
	if s.detector == nil {
		s.sendError(400, "Session not configured", "Please send config first")
		return
	}

	state, err := s.detector.ProcessFrame(audioMsg.Data, audioMsg.Timestamp)
	if err != nil {
		s.sendError(500, "VAD processing failed", err.Error())
		return
	}

	s.sendVADStatus(state.String(), audioMsg.Timestamp)
}

func (s *Session) handleConfig(configMsg *ConfigMessage) {
	s.config = configMsg

	vadConfig := vad.VADConfig{
		Aggressiveness:    configMsg.VADAggressiveness,
		SilenceDurationMs: configMsg.VADSilenceMs,
		Threshold:         configMsg.VADThreshold,
		SampleRate:        int(configMsg.SampleRate),
		PreRollMs:         configMsg.VADPreRollMs,
		PostRollMs:        configMsg.VADPostRollMs,
		MinSegmentMs:      configMsg.VADMinSegmentMs,
	}

	if s.detector == nil {
		s.detector = vad.NewVADDetector(vadConfig)
		s.detector.SetCallback(s.onAudioSegment)
	} else {
		s.detector.UpdateConfig(vadConfig)
	}

	if s.sequencer == nil {
		s.sequencer = audio.NewSequencer(100, 5000)
		s.sequencer.SetCallback(s.onResult)
	}
}

func (s *Session) handleControl(controlMsg *ControlMessage) {
	switch controlMsg.Action {
	case "start":
		if s.detector != nil {
			s.detector.Reset()
		}
		if s.sequencer != nil {
			s.sequencer.Reset()
		}
	case "stop":
		if s.detector != nil {
			s.detector.Flush(time.Now().UnixMilli())
		}
	case "flush":
		if s.sequencer != nil {
			s.sequencer.Flush()
		}
	}
}

func (s *Session) onAudioSegment(segment *vad.AudioSegment) {
	go func() {
		transcript := &audio.SegmentResult{
			SegmentID: segment.ID,
			Type:        audio.ResultTypeTranscript,
			Text:        "[模拟识别文本",
			Confidence:  0.95,
			IsFinal:     true,
			SourceLang:  s.config.SourceLang,
		}

		if s.sequencer != nil {
			s.sequencer.Add(transcript)
		}

		translation := &audio.SegmentResult{
			SegmentID:   segment.ID,
			Type:        audio.ResultTypeTranslation,
			Text:        "[模拟识别文本",
			Translated:  "[模拟翻译文本]",
			IsFinal:     true,
			SourceLang:  s.config.SourceLang,
			TargetLang:  s.config.TargetLang,
		}

		if s.sequencer != nil {
			s.sequencer.Add(translation)
		}
	}()
}

func (s *Session) onResult(result *audio.SegmentResult) {
	switch result.Type {
	case audio.ResultTypeTranscript:
		s.sendTranscript(result)
	case audio.ResultTypeTranslation:
		s.sendTranslation(result)
	}
}

func (s *Session) sendTranscript(result *audio.SegmentResult) {
	payload := TranscriptPayload{
		SegmentID:  result.SegmentID,
		Text:       result.Text,
		IsFinal:    result.IsFinal,
		Confidence: result.Confidence,
	}

	s.sendChan <- ServerMessage{
		Type:    "transcript",
		Payload: payload,
	}
}

func (s *Session) sendTranslation(result *audio.SegmentResult) {
	payload := TranslationPayload{
		SegmentID:      result.SegmentID,
		SourceText:     result.Text,
		TranslatedText: result.Translated,
		TargetLang:     result.TargetLang,
		IsFinal:        result.IsFinal,
	}

	s.sendChan <- ServerMessage{
		Type:    "translation",
		Payload: payload,
	}
}

func (s *Session) sendVADStatus(state string, timestamp int64) {
	payload := VADStatusPayload{
		State:     state,
		Timestamp: timestamp,
	}

	s.sendChan <- ServerMessage{
		Type:    "vadStatus",
		Payload: payload,
	}
}

func (s *Session) sendError(code int, message string, details string) {
	payload := ErrorPayload{
		Code:    code,
		Message: message,
		Details: details,
	}

	select {
	case s.sendChan <- ServerMessage{
		Type:    "error",
		Payload: payload,
	}:
	default:
	}
}

func (s *Session) handleSend() {
	defer s.Close()

	for {
		select {
		case <-s.closeChan:
			return
		case msg := <-s.sendChan:
			data, err := json.Marshal(msg)
			if err != nil {
				continue
			}
			s.conn.WriteMessage(websocket.TextMessage, data)
		}
	}
}

func (s *Session) Close() {
	s.once.Do(func() {
		close(s.closeChan)
		s.conn.Close()
		if s.sequencer != nil {
			s.sequencer.Close()
		}
	})
}

func (s *Server) RemoveSession(sessionID string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if session, exists := s.sessions[sessionID]; exists {
		session.Close()
		delete(s.sessions, sessionID)
	}
}

func generateSessionID() string {
	return "sess_" + time.Now().Format("20060102150405")
}

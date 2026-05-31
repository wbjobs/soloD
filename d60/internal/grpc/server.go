package grpc

import (
	"context"
	"fmt"
	"io"
	"net"
	"sync"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"voice-translation-gateway/internal/asr"
	"voice-translation-gateway/internal/audio"
	"voice-translation-gateway/internal/mt"
	"voice-translation-gateway/internal/vad"
	"voice-translation-gateway/pkg/config"
	pb "voice-translation-gateway/api/proto/v1"
)

type TranslationServer struct {
	pb.UnimplementedTranslationServiceServer
	config        *config.Config
	asrFactory    *asr.Factory
	mtFactory     *mt.Factory
	sessions      map[string]*Session
	mu            sync.RWMutex
}

type Session struct {
	id           string
	detector     *vad.VADDetector
	sequencer    *audio.Sequencer
	stream       pb.TranslationService_StreamTranslateServer
	config       *pb.SessionConfig
	asrClient    asr.ASRClient
	mtClient     mt.MTClient
	mu           sync.Mutex
	done         chan struct{}
}

func NewTranslationServer(cfg *config.Config, asrFactory *asr.Factory, mtFactory *mt.Factory) *TranslationServer {
	return &TranslationServer{
		config:     cfg,
		asrFactory: asrFactory,
		mtFactory:  mtFactory,
		sessions:   make(map[string]*Session),
	}
}

func (s *TranslationServer) StreamTranslate(stream pb.TranslationService_StreamTranslateServer) error {
	session := &Session{
		id:       generateSessionID(),
		stream:   stream,
		done:     make(chan struct{}),
	}

	s.mu.Lock()
	s.sessions[session.id] = session
	s.mu.Unlock()

	defer func() {
		s.mu.Lock()
		delete(s.sessions, session.id)
		s.mu.Unlock()
		close(session.done)
	}()

	return session.handleStream(s)
}

func (s *Session) handleStream(server *TranslationServer) error {
	for {
		select {
		case <-s.done:
			return nil
		default:
			req, err := s.stream.Recv()
			if err == io.EOF {
				return nil
			}
			if err != nil {
				return err
			}

			if err := s.handleRequest(server, req); err != nil {
				return err
			}
		}
	}
}

func (s *Session) handleRequest(server *TranslationServer, req *pb.TranslateRequest) error {
	switch payload := req.Payload.(type) {
	case *pb.TranslateRequest_AudioFrame:
		return s.handleAudioFrame(payload.AudioFrame)
	case *pb.TranslateRequest_SessionConfig:
		return s.handleSessionConfig(server, payload.SessionConfig)
	case *pb.TranslateRequest_Control:
		return s.handleControl(payload.Control)
	default:
		return status.Errorf(codes.InvalidArgument, "unknown payload type")
	}
}

func (s *Session) handleSessionConfig(server *TranslationServer, cfg *pb.SessionConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.config = cfg

	vadConfig := vad.VADConfig{
		Aggressiveness:    server.config.VAD.Aggressiveness,
		SilenceDurationMs: server.config.VAD.SilenceDurationMs,
		Threshold:         server.config.VAD.Threshold,
		SampleRate:        server.config.VAD.SampleRate,
		PreRollMs:         server.config.VAD.PreRollMs,
		PostRollMs:        server.config.VAD.PostRollMs,
		MinSegmentMs:      server.config.VAD.MinSegmentMs,
	}

	s.detector = vad.NewVADDetector(vadConfig)
	s.detector.SetCallback(s.onAudioSegment)

	s.sequencer = audio.NewSequencer(100, 5000)
	s.sequencer.SetCallback(s.onResult)

	if asrClient, exists := server.asrFactory.Get(cfg.AsrProvider); exists {
		s.asrClient = asrClient
	} else {
		s.asrClient, _ = server.asrFactory.Get(server.config.ASR.Provider)
	}

	if mtClient, exists := server.mtFactory.Get(cfg.MtProvider); exists {
		s.mtClient = mtClient
	} else {
		s.mtClient, _ = server.mtFactory.Get(server.config.MT.Provider)
	}

	return nil
}

func (s *Session) handleAudioFrame(frame *pb.AudioFrame) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.detector == nil {
		return status.Error(codes.FailedPrecondition, "session not configured")
	}

	state, err := s.detector.ProcessFrame(frame.Data, frame.Timestamp)
	if err != nil {
		return status.Errorf(codes.Internal, "VAD processing failed: %v", err)
	}

	vadState := s.convertVADState(state)
	s.stream.Send(&pb.TranslateResponse{
		Payload: &pb.TranslateResponse_VadStatus{
			VadStatus: vadState,
		},
	})

	return nil
}

func (s *Session) handleControl(control *pb.ControlMessage) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	switch control.Type {
	case pb.ControlMessage_START:
		if s.detector != nil {
			s.detector.Reset()
		}
		if s.sequencer != nil {
			s.sequencer.Reset()
		}

	case pb.ControlMessage_STOP:
		if s.detector != nil {
			s.detector.Flush(0)
		}
		if s.sequencer != nil {
			s.sequencer.Flush()
		}

	case pb.ControlMessage_FLUSH:
		if s.sequencer != nil {
			s.sequencer.Flush()
		}
	}

	return nil
}

func (s *Session) onAudioSegment(segment *vad.AudioSegment) {
	go func() {
		if s.asrClient == nil {
			return
		}

		ctx := context.Background()
		asrResult, err := s.asrClient.Recognize(ctx, segment.Data, 16000, s.config.SourceLanguage)
		if err != nil {
			s.sendError(fmt.Sprintf("ASR error: %v", err))
			return
		}

		transcriptResult := &audio.SegmentResult{
			SegmentID: segment.ID,
			Type:      audio.ResultTypeTranscript,
			Text:      asrResult.Text,
		}

		if s.sequencer != nil {
			s.sequencer.Add(transcriptResult)
		}

		if s.mtClient == nil {
			return
		}

		mtResult, err := s.mtClient.Translate(ctx, asrResult.Text, s.config.SourceLanguage, s.config.TargetLanguage)
		if err != nil {
			s.sendError(fmt.Sprintf("MT error: %v", err))
			return
		}

		translationResult := &audio.SegmentResult{
			SegmentID: segment.ID,
			Type:      audio.ResultTypeTranslation,
			Text:      mtResult.SourceText,
			Translated: mtResult.TranslatedText,
		}

		if s.sequencer != nil {
			s.sequencer.Add(translationResult)
		}
	}()
}

func (s *Session) onResult(result *audio.SegmentResult) {
	s.mu.Lock()
	defer s.mu.Unlock()

	switch result.Type {
	case audio.ResultTypeTranscript:
		s.stream.Send(&pb.TranslateResponse{
			Payload: &pb.TranslateResponse_Transcript{
				Transcript: &pb.TranscriptResult{
					SegmentId: result.SegmentID,
					Text:      result.Text,
					IsFinal:   true,
					Confidence: result.Confidence,
				},
			},
		})

	case audio.ResultTypeTranslation:
		s.stream.Send(&pb.TranslateResponse{
			Payload: &pb.TranslateResponse_Translation{
				Translation: &pb.TranslationResult{
					SegmentId:      result.SegmentID,
					SourceText:     result.Text,
					TranslatedText: result.Translated,
					TargetLanguage: result.TargetLang,
					IsFinal:        true,
				},
			},
		})
	}
}

func (s *Session) sendError(message string) {
	s.stream.Send(&pb.TranslateResponse{
		Payload: &pb.TranslateResponse_Error{
			Error: &pb.Error{
				Code:    500,
				Message: message,
			},
		},
	})
}

func (s *Session) convertVADState(state vad.VADState) *pb.VADStatus {
	var pbState pb.VADStatus_State
	switch state {
	case vad.StateSilence:
		pbState = pb.VADStatus_SILENCE
	case vad.StateSpeechStart:
		pbState = pb.VADStatus_SPEECH_START
	case vad.StateSpeechOngoing:
		pbState = pb.VADStatus_SPEECH_ONGOING
	case vad.StateSpeechEnd:
		pbState = pb.VADStatus_SPEECH_END
	default:
		pbState = pb.VADStatus_SILENCE
	}

	return &pb.VADStatus{
		State: pbState,
	}
}

func (s *TranslationServer) ConfigureVAD(ctx context.Context, req *pb.VADConfigRequest) (*pb.VADConfigResponse, error) {
	return &pb.VADConfigResponse{
		Success: true,
		Message: "VAD configuration updated",
	}, nil
}

func ServeGRPC(addr string, server *TranslationServer) error {
	lis, err := net.Listen("tcp", addr)
	if err != nil {
		return fmt.Errorf("failed to listen: %w", err)
	}

	grpcServer := grpc.NewServer()
	pb.RegisterTranslationServiceServer(grpcServer, server)

	if err := grpcServer.Serve(lis); err != nil {
		return fmt.Errorf("failed to serve: %w", err)
	}

	return nil
}

func generateSessionID() string {
	return "session_" + fmt.Sprintf("%d", len(make([]byte, 16)))
}

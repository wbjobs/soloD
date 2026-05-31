package asr

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type ASRResult struct {
	Text       string
	Confidence float32
	Segments   []Segment
}

type Segment struct {
	Text      string
	StartTime float64
	EndTime   float64
}

type ASRClient interface {
	Recognize(ctx context.Context, audioData []byte, sampleRate int, language string) (*ASRResult, error)
	Name() string
}

type PaddleASRConfig struct {
	APIEndpoint string
	APIKey      string
	Timeout     time.Duration
}

type PaddleASRClient struct {
	config PaddleASRConfig
	client *http.Client
}

func NewPaddleASRClient(config PaddleASRConfig) *PaddleASRClient {
	if config.Timeout == 0 {
		config.Timeout = 30 * time.Second
	}

	return &PaddleASRClient{
		config: config,
		client: &http.Client{
			Timeout: config.Timeout,
		},
	}
}

func (p *PaddleASRClient) Name() string {
	return "paddle"
}

func (p *PaddleASRClient) Recognize(ctx context.Context, audioData []byte, sampleRate int, language string) (*ASRResult, error) {
	if p.config.APIEndpoint == "" {
		return p.mockRecognize(audioData, language)
	}

	requestBody := map[string]interface{}{
		"audio":     audioData,
		"sample_rate": sampleRate,
		"language":   language,
		"format":    "wav",
	}

	jsonData, err := json.Marshal(requestBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", p.config.APIEndpoint, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	if p.config.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+p.config.APIKey)
	}

	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API returned error %d: %s", resp.StatusCode, body)
	}

	var result struct {
		Text       string  `json:"text"`
		Confidence float32 `json:"confidence"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &ASRResult{
		Text:       result.Text,
		Confidence: result.Confidence,
	}, nil
}

func (p *PaddleASRClient) mockRecognize(audioData []byte, language string) (*ASRResult, error) {
	time.Sleep(100 * time.Millisecond)

	return &ASRResult{
		Text:       fmt.Sprintf("[PaddleASR] 模拟识别结果 - %s", language),
		Confidence: 0.92,
	}, nil
}

type FunASRConfig struct {
	APIEndpoint string
	Timeout     time.Duration
}

type FunASRClient struct {
	config FunASRConfig
	client *http.Client
}

func NewFunASRClient(config FunASRConfig) *FunASRClient {
	if config.Timeout == 0 {
		config.Timeout = 30 * time.Second
	}

	return &FunASRClient{
		config: config,
		client: &http.Client{
			Timeout: config.Timeout,
		},
	}
}

func (f *FunASRClient) Name() string {
	return "funasr"
}

func (f *FunASRClient) Recognize(ctx context.Context, audioData []byte, sampleRate int, language string) (*ASRResult, error) {
	if f.config.APIEndpoint == "" {
		return f.mockRecognize(audioData, language)
	}

	requestBody := map[string]interface{}{
		"audio":      audioData,
		"sample_rate": sampleRate,
		"language":    language,
		"mode":       "online",
	}

	jsonData, err := json.Marshal(requestBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", f.config.APIEndpoint, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := f.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API returned error %d: %s", resp.StatusCode, body)
	}

	var result struct {
		Text       string   `json:"text"`
		Timestamp  []float64 `json:"timestamp"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	return &ASRResult{
		Text:       result.Text,
		Confidence: 0.95,
	}, nil
}

func (f *FunASRClient) mockRecognize(audioData []byte, language string) (*ASRResult, error) {
	time.Sleep(150 * time.Millisecond)

	return &ASRResult{
		Text:       fmt.Sprintf("[FunASR] 模拟识别结果 - %s", language),
		Confidence: 0.94,
	}, nil
}

type Factory struct {
	clients map[string]ASRClient
}

func NewFactory() *Factory {
	return &Factory{
		clients: make(map[string]ASRClient),
	}
}

func (f *Factory) Register(name string, client ASRClient) {
	f.clients[name] = client
}

func (f *Factory) Get(name string) (ASRClient, bool) {
	client, exists := f.clients[name]
	return client, exists
}

func (f *Factory) GetOrDefault(name string, defaultClient ASRClient) ASRClient {
	if client, exists := f.clients[name]; exists {
		return client
	}
	return defaultClient
}

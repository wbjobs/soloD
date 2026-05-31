package mt

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type TranslationResult struct {
	SourceText     string
	TranslatedText string
	SourceLang     string
	TargetLang     string
}

type MTClient interface {
	Translate(ctx context.Context, text string, sourceLang string, targetLang string) (*TranslationResult, error)
	Name() string
}

type GoogleTranslateConfig struct {
	APIKey  string
	Timeout time.Duration
}

type GoogleTranslateClient struct {
	config GoogleTranslateConfig
	client *http.Client
}

func NewGoogleTranslateClient(config GoogleTranslateConfig) *GoogleTranslateClient {
	if config.Timeout == 0 {
		config.Timeout = 10 * time.Second
	}

	return &GoogleTranslateClient{
		config: config,
		client: &http.Client{
			Timeout: config.Timeout,
		},
	}
}

func (g *GoogleTranslateClient) Name() string {
	return "google"
}

func (g *GoogleTranslateClient) Translate(ctx context.Context, text string, sourceLang string, targetLang string) (*TranslationResult, error) {
	if g.config.APIKey == "" {
		return g.mockTranslate(text, sourceLang, targetLang)
	}

	url := fmt.Sprintf("https://translation.googleapis.com/language/translate/v2?key=%s", g.config.APIKey)

	requestBody := map[string]interface{}{
		"q":      text,
		"source": sourceLang,
		"target": targetLang,
		"format": "text",
	}

	jsonData, err := json.Marshal(requestBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	resp, err := g.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API returned error %d: %s", resp.StatusCode, body)
	}

	var result struct {
		Data struct {
			Translations []struct {
				TranslatedText string `json:"translatedText"`
			} `json:"translations"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if len(result.Data.Translations) == 0 {
		return nil, fmt.Errorf("no translation results")
	}

	return &TranslationResult{
		SourceText:     text,
		TranslatedText: result.Data.Translations[0].TranslatedText,
		SourceLang:     sourceLang,
		TargetLang:     targetLang,
	}, nil
}

func (g *GoogleTranslateClient) mockTranslate(text string, sourceLang string, targetLang string) (*TranslationResult, error) {
	time.Sleep(50 * time.Millisecond)

	translations := map[string]string{
		"zh-en": fmt.Sprintf("[Google] Translated: %s", text),
		"en-zh": fmt.Sprintf("[Google] 翻译结果: %s", text),
		"ja-en": fmt.Sprintf("[Google] Translated: %s", text),
		"en-ja": fmt.Sprintf("[Google] 翻訳結果: %s", text),
	}

	key := fmt.Sprintf("%s-%s", sourceLang, targetLang)
	translatedText, exists := translations[key]
	if !exists {
		translatedText = fmt.Sprintf("[Google] %s -> %s: %s", sourceLang, targetLang, text)
	}

	return &TranslationResult{
		SourceText:     text,
		TranslatedText: translatedText,
		SourceLang:     sourceLang,
		TargetLang:     targetLang,
	}, nil
}

type DeepLConfig struct {
	APIKey  string
	BaseURL string
	Timeout time.Duration
}

type DeepLClient struct {
	config DeepLConfig
	client *http.Client
}

func NewDeepLClient(config DeepLConfig) *DeepLClient {
	if config.BaseURL == "" {
		config.BaseURL = "https://api-free.deepl.com/v2"
	}
	if config.Timeout == 0 {
		config.Timeout = 10 * time.Second
	}

	return &DeepLClient{
		config: config,
		client: &http.Client{
			Timeout: config.Timeout,
		},
	}
}

func (d *DeepLClient) Name() string {
	return "deepl"
}

func (d *DeepLClient) Translate(ctx context.Context, text string, sourceLang string, targetLang string) (*TranslationResult, error) {
	if d.config.APIKey == "" {
		return d.mockTranslate(text, sourceLang, targetLang)
	}

	url := fmt.Sprintf("%s/translate", d.config.BaseURL)

	requestBody := map[string]interface{}{
		"text":        []string{text},
		"source_lang": sourceLang,
		"target_lang": targetLang,
	}

	jsonData, err := json.Marshal(requestBody)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "DeepL-Auth-Key "+d.config.APIKey)

	resp, err := d.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API returned error %d: %s", resp.StatusCode, body)
	}

	var result struct {
		Translations []struct {
			DetectedSourceLanguage string `json:"detected_source_language"`
			Text                  string `json:"text"`
		} `json:"translations"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode response: %w", err)
	}

	if len(result.Translations) == 0 {
		return nil, fmt.Errorf("no translation results")
	}

	return &TranslationResult{
		SourceText:     text,
		TranslatedText: result.Translations[0].Text,
		SourceLang:     result.Translations[0].DetectedSourceLanguage,
		TargetLang:     targetLang,
	}, nil
}

func (d *DeepLClient) mockTranslate(text string, sourceLang string, targetLang string) (*TranslationResult, error) {
	time.Sleep(80 * time.Millisecond)

	translations := map[string]string{
		"zh-en": fmt.Sprintf("[DeepL] Translated: %s", text),
		"en-zh": fmt.Sprintf("[DeepL] 翻译结果: %s", text),
		"ja-en": fmt.Sprintf("[DeepL] Translated: %s", text),
		"en-ja": fmt.Sprintf("[DeepL] 翻訳結果: %s", text),
	}

	key := fmt.Sprintf("%s-%s", sourceLang, targetLang)
	translatedText, exists := translations[key]
	if !exists {
		translatedText = fmt.Sprintf("[DeepL] %s -> %s: %s", sourceLang, targetLang, text)
	}

	return &TranslationResult{
		SourceText:     text,
		TranslatedText: translatedText,
		SourceLang:     sourceLang,
		TargetLang:     targetLang,
	}, nil
}

type Factory struct {
	clients map[string]MTClient
}

func NewFactory() *Factory {
	return &Factory{
		clients: make(map[string]MTClient),
	}
}

func (f *Factory) Register(name string, client MTClient) {
	f.clients[name] = client
}

func (f *Factory) Get(name string) (MTClient, bool) {
	client, exists := f.clients[name]
	return client, exists
}

func (f *Factory) GetOrDefault(name string, defaultClient MTClient) MTClient {
	if client, exists := f.clients[name]; exists {
		return client
	}
	return defaultClient
}

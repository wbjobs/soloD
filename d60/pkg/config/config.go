package config

import (
	"fmt"
	"os"

	"github.com/spf13/viper"
)

type Config struct {
	Server ServerConfig `mapstructure:"server"`
	VAD    VADConfig    `mapstructure:"vad"`
	ASR    ASRConfig    `mapstructure:"asr"`
	MT     MTConfig     `mapstructure:"mt"`
}

type ServerConfig struct {
	HTTPAddr        string `mapstructure:"http_addr"`
	GRPCAddr        string `mapstructure:"grpc_addr"`
	WebSocketPath   string `mapstructure:"websocket_path"`
	StreamTimeoutMs int   `mapstructure:"stream_timeout_ms"`
}

type VADConfig struct {
	Aggressiveness    int     `mapstructure:"aggressiveness"`
	SilenceDurationMs int     `mapstructure:"silence_duration_ms"`
	Threshold         float32 `mapstructure:"threshold"`
	SampleRate        int     `mapstructure:"sample_rate"`
	PreRollMs         int     `mapstructure:"pre_roll_ms"`
	PostRollMs        int     `mapstructure:"post_roll_ms"`
	MinSegmentMs      int     `mapstructure:"min_segment_ms"`
}

type ASRConfig struct {
	Provider    string            `mapstructure:"provider"`
	PaddleASR   PaddleASRConfig   `mapstructure:"paddleasr"`
	FunASR      FunASRConfig      `mapstructure:"funasr"`
}

type PaddleASRConfig struct {
	APIEndpoint string `mapstructure:"api_endpoint"`
	APIKey      string `mapstructure:"api_key"`
}

type FunASRConfig struct {
	APIEndpoint string `mapstructure:"api_endpoint"`
}

type MTConfig struct {
	Provider        string                `mapstructure:"provider"`
	GoogleTranslate GoogleTranslateConfig `mapstructure:"google_translate"`
	DeepL           DeepLConfig           `mapstructure:"deepl"`
}

type GoogleTranslateConfig struct {
	APIKey string `mapstructure:"api_key"`
}

type DeepLConfig struct {
	APIKey  string `mapstructure:"api_key"`
	BaseURL string `mapstructure:"base_url"`
}

func Load(configFile string) (*Config, error) {
	v := viper.New()

	if configFile != "" {
		v.SetConfigFile(configFile)
	} else {
		v.SetConfigName("config")
		v.SetConfigType("yaml")
		v.AddConfigPath(".")
		v.AddConfigPath("./config")
		v.AddConfigPath("/etc/voice-gateway")
	}

	v.SetEnvPrefix("VG")
	v.AutomaticEnv()

	setDefaults(v)

	if err := v.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return nil, fmt.Errorf("failed to read config file: %w", err)
		}
	}

	var config Config
	if err := v.Unmarshal(&config); err != nil {
		return nil, fmt.Errorf("failed to unmarshal config: %w", err)
	}

	return &config, nil
}

func setDefaults(v *viper.Viper) {
	v.SetDefault("server.http_addr", ":8080")
	v.SetDefault("server.grpc_addr", ":50051")
	v.SetDefault("server.websocket_path", "/ws")
	v.SetDefault("server.stream_timeout_ms", 120000)

	v.SetDefault("vad.aggressiveness", 2)
	v.SetDefault("vad.silence_duration_ms", 300)
	v.SetDefault("vad.threshold", 0.5)
	v.SetDefault("vad.sample_rate", 16000)
	v.SetDefault("vad.pre_roll_ms", 200)
	v.SetDefault("vad.post_roll_ms", 150)
	v.SetDefault("vad.min_segment_ms", 800)

	v.SetDefault("asr.provider", "funasr")
	v.SetDefault("asr.paddleasr.api_endpoint", "")
	v.SetDefault("asr.paddleasr.api_key", "")
	v.SetDefault("asr.funasr.api_endpoint", "")

	v.SetDefault("mt.provider", "google")
	v.SetDefault("mt.google_translate.api_key", "")
	v.SetDefault("mt.deepl.api_key", "")
	v.SetDefault("mt.deepl.base_url", "https://api-free.deepl.com/v2")
}

func (c *Config) Save(filename string) error {
	v := viper.New()
	v.SetConfigType("yaml")

	v.Set("server", c.Server)
	v.Set("vad", c.VAD)
	v.Set("asr", c.ASR)
	v.Set("mt", c.MT)

	return v.WriteConfigAs(filename)
}

func ExampleConfig() *Config {
	return &Config{
		Server: ServerConfig{
			HTTPAddr:        ":8080",
			GRPCAddr:        ":50051",
			WebSocketPath:   "/ws",
			StreamTimeoutMs: 120000,
		},
		VAD: VADConfig{
			Aggressiveness:    2,
			SilenceDurationMs: 300,
			Threshold:         0.5,
			SampleRate:        16000,
			PreRollMs:         200,
			PostRollMs:        150,
			MinSegmentMs:      800,
		},
		ASR: ASRConfig{
			Provider: "funasr",
			PaddleASR: PaddleASRConfig{
				APIEndpoint: "http://localhost:8090/paddlespeech/asr",
				APIKey:      "",
			},
			FunASR: FunASRConfig{
				APIEndpoint: "http://localhost:10095/recognition",
			},
		},
		MT: MTConfig{
			Provider: "google",
			GoogleTranslate: GoogleTranslateConfig{
				APIKey: "",
			},
			DeepL: DeepLConfig{
				APIKey:  "",
				BaseURL: "https://api-free.deepl.com/v2",
			},
		},
	}
}

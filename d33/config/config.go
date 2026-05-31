package config

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Docker     DockerConfig     `yaml:"docker"`
	Filters    FiltersConfig    `yaml:"filters"`
	Webhook    WebhookConfig    `yaml:"webhook"`
	Dashboard  DashboardConfig  `yaml:"dashboard"`
}

type DockerConfig struct {
	ContainerID string `yaml:"container_id"`
	Follow      bool   `yaml:"follow"`
	Tail        string `yaml:"tail"`
	ShowStdout  bool   `yaml:"show_stdout"`
	ShowStderr  bool   `yaml:"show_stderr"`
}

type FiltersConfig struct {
	Keywords []string `yaml:"keywords"`
}

type WebhookConfig struct {
	DingTalk DingTalkConfig `yaml:"dingtalk"`
	Slack    SlackConfig    `yaml:"slack"`
	Enabled  bool           `yaml:"enabled"`
}

type DingTalkConfig struct {
	WebhookURL string `yaml:"webhook_url"`
	Secret     string `yaml:"secret"`
}

type SlackConfig struct {
	WebhookURL string `yaml:"webhook_url"`
	Channel    string `yaml:"channel"`
}

type DashboardConfig struct {
	Enabled         bool   `yaml:"enabled"`
	Port            int    `yaml:"port"`
	Host            string `yaml:"host"`
	MaxLogs         int    `yaml:"max_logs"`
	ContextWindow   int    `yaml:"context_window_seconds"`
	MaxAlertHistory int    `yaml:"max_alert_history"`
}

func LoadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse config file: %w", err)
	}

	setDefaults(&cfg)
	return &cfg, nil
}

func setDefaults(cfg *Config) {
	if cfg.Docker.Follow == false {
		cfg.Docker.Follow = true
	}
	if cfg.Docker.Tail == "" {
		cfg.Docker.Tail = "100"
	}
	if cfg.Docker.ShowStdout == false {
		cfg.Docker.ShowStdout = true
	}
	if cfg.Docker.ShowStderr == false {
		cfg.Docker.ShowStderr = true
	}
	if len(cfg.Filters.Keywords) == 0 {
		cfg.Filters.Keywords = []string{"ERROR", "error", "Error"}
	}
	if cfg.Dashboard.Port == 0 {
		cfg.Dashboard.Port = 8080
	}
	if cfg.Dashboard.Host == "" {
		cfg.Dashboard.Host = "localhost"
	}
	if cfg.Dashboard.MaxLogs == 0 {
		cfg.Dashboard.MaxLogs = 500
	}
	if cfg.Dashboard.ContextWindow == 0 {
		cfg.Dashboard.ContextWindow = 30
	}
	if cfg.Dashboard.MaxAlertHistory == 0 {
		cfg.Dashboard.MaxAlertHistory = 100
	}
}

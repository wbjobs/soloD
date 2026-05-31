package wasm

import (
	"encoding/json"
	"fmt"

	"istio-fault-injection-engine/pkg/models"
)

type WasmFilterGenerator struct{}

func NewWasmFilterGenerator() *WasmFilterGenerator {
	return &WasmFilterGenerator{}
}

func (g *WasmFilterGenerator) GenerateConfiguration(rule *models.FaultRule) (string, error) {
	config := FaultInjectionConfig{
		RuleID:              rule.ID,
		RuleName:            rule.Name,
		FaultType:           string(rule.Fault.Type),
		Enabled:             rule.Enabled,
		TimeoutThresholdPct: rule.TimeoutAware.TimeoutThresholdPct,
		DefaultTimeoutMS:    rule.TimeoutAware.DefaultTimeoutMS,
		TimeoutAwareEnabled: rule.TimeoutAware.Enabled,
		ConnectionLeakConfig: ConnectionLeakWasmConfig{
			Enabled:             rule.ConnectionLeakDetect.Enabled,
			CheckIntervalMS:     rule.ConnectionLeakDetect.CheckIntervalMS,
			MaxConnectionGrowth: rule.ConnectionLeakDetect.MaxConnectionGrowth,
			LeakThreshold:       rule.ConnectionLeakDetect.LeakThreshold,
			ForceCleanupEnabled: rule.ConnectionLeakDetect.ForceCleanupEnabled,
		},
		Match: MatchWasmConfig{
			Headers:    convertHeaders(rule.Match.Headers),
			Percentage: rule.Match.Percentage,
		},
		Canary: CanaryWasmConfig{
			Enabled: rule.CanaryMode.Enabled,
			Headers: rule.CanaryMode.Header,
		},
	}

	switch rule.Fault.Type {
	case models.FaultTypeDelay:
		if rule.Fault.Delay != nil {
			config.Delay = &DelayWasmConfig{
				DelayType: string(rule.Fault.Delay.DelayType),
			}
			if rule.Fault.Delay.Fixed != nil {
				config.Delay.FixedMS = rule.Fault.Delay.Fixed.DurationMS
			}
			if rule.Fault.Delay.Normal != nil {
				config.Delay.MeanMS = rule.Fault.Delay.Normal.MeanMS
				config.Delay.StdDevMS = rule.Fault.Delay.Normal.StdDevMS
				config.Delay.MinMS = rule.Fault.Delay.Normal.MinMS
				config.Delay.MaxMS = rule.Fault.Delay.Normal.MaxMS
			}
			if rule.Fault.Delay.Jitter != nil {
				config.Delay.JitterMinMS = rule.Fault.Delay.Jitter.MinMS
				config.Delay.JitterMaxMS = rule.Fault.Delay.Jitter.MaxMS
			}
		}
	case models.FaultTypeAbort:
		if rule.Fault.Abort != nil {
			config.Abort = &AbortWasmConfig{
				AbortType: string(rule.Fault.Abort.AbortType),
				Message:   rule.Fault.Abort.Message,
			}
			if rule.Fault.Abort.HTTPStatus != nil {
				config.Abort.HTTPStatus = *rule.Fault.Abort.HTTPStatus
			}
		}
	}

	jsonData, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return "", fmt.Errorf("failed to marshal wasm config: %w", err)
	}

	return string(jsonData), nil
}

func (g *WasmFilterGenerator) GenerateRustCodeSkeleton() string {
	return `
use proxy_wasm::traits::*;
use proxy_wasm::types::*;
use std::time::Duration;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct FaultInjectionConfig {
    pub rule_id: String,
    pub rule_name: String,
    pub fault_type: String,
    pub enabled: bool,
    pub timeout_threshold_pct: f64,
    pub default_timeout_ms: i64,
    pub timeout_aware_enabled: bool,
}

pub struct FaultInjectionFilter {
    config: FaultInjectionConfig,
    connection_tracker: ConnectionTracker,
}

impl Context for FaultInjectionFilter {}

impl HttpContext for FaultInjectionFilter {
    fn on_http_request_headers(&mut self, _num_headers: usize, _end_of_stream: bool) -> Action {
        if !self.config.enabled {
            return Action::Continue;
        }

        let timeout_ms = self.get_effective_timeout();
        let threshold_ms = (timeout_ms as f64 * self.config.timeout_threshold_pct / 100.0) as i64;

        match self.config.fault_type.as_str() {
            "delay" => {
                self.handle_delay_injection(threshold_ms);
            }
            "abort" => {
                self.handle_abort_injection();
            }
            _ => {}
        }

        Action::Continue
    }

    fn on_http_response_headers(&mut self, _num_headers: usize, _end_of_stream: bool) -> Action {
        self.connection_tracker.cleanup_expired();
        Action::Continue
    }
}

impl FaultInjectionFilter {
    fn handle_delay_injection(&mut self, threshold_ms: i64) {
        let delay_ms = self.calculate_delay();
        
        if self.config.timeout_aware_enabled && delay_ms > threshold_ms {
            self.send_http_response(
                504,
                vec![
                    ("x-fault-injection", "timeout-protection"),
                    ("x-fault-rule-id", &self.config.rule_id),
                ],
                Some(b"Gateway Timeout - Fault Injection Protection"),
            );
            return;
        }

        self.sleep(Duration::from_millis(delay_ms as u64), |_| {});
    }

    fn handle_abort_injection(&mut self) {
        self.send_http_response(
            503,
            vec![
                ("x-fault-injection", "abort"),
                ("x-fault-rule-id", &self.config.rule_id),
            ],
            Some(b"Service Unavailable - Fault Injection"),
        );
    }

    fn calculate_delay(&self) -> i64 {
        1000
    }

    fn get_effective_timeout(&self) -> i64 {
        self.config.default_timeout_ms
    }
}

pub struct ConnectionTracker {
    connections: std::collections::HashMap<String, std::time::Instant>,
}

impl ConnectionTracker {
    fn new() -> Self {
        Self {
            connections: std::collections::HashMap::new(),
        }
    }

    fn track(&mut self, conn_id: String) {
        self.connections.insert(conn_id, std::time::Instant::now());
    }

    fn cleanup_expired(&mut self) {
        let now = std::time::Instant::now();
        self.connections.retain(|_, &mut created| {
            now.duration_since(created) < std::time::Duration::from_secs(300)
        });
    }
}

#[no_mangle]
pub fn _start() {
    proxy_wasm::set_log_level(LogLevel::Info);
}
`
}

func (g *WasmFilterGenerator) GenerateCPPInclude() string {
	return `#include "proxy_wasm_intrinsics.h"
#include <chrono>
#include <unordered_map>
#include <string>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

class FaultInjectionFilter : public Context {
public:
  explicit FaultInjectionFilter(uint32_t id) : Context(id) {}

  FilterHeadersStatus onRequestHeaders(uint32_t headers, bool end_of_stream) override;
  FilterHeadersStatus onResponseHeaders(uint32_t headers, bool end_of_stream) override;

private:
  struct Config {
    std::string rule_id;
    std::string rule_name;
    std::string fault_type;
    bool enabled = true;
    double timeout_threshold_pct = 80.0;
    int64_t default_timeout_ms = 30000;
    bool timeout_aware_enabled = true;
  };

  Config config_;
  std::unordered_map<std::string, std::chrono::steady_clock::time_point> connections_;
  
  void handleDelayInjection(int64_t threshold_ms);
  void handleAbortInjection();
  int64_t calculateDelay();
  int64_t getEffectiveTimeout();
  void cleanupExpiredConnections();
};
`
}

type FaultInjectionConfig struct {
	RuleID              string               `json:"rule_id"`
	RuleName            string               `json:"rule_name"`
	FaultType           string               `json:"fault_type"`
	Enabled             bool                 `json:"enabled"`
	TimeoutThresholdPct float64              `json:"timeout_threshold_pct"`
	DefaultTimeoutMS    int64                `json:"default_timeout_ms"`
	TimeoutAwareEnabled bool                 `json:"timeout_aware_enabled"`
	ConnectionLeakConfig ConnectionLeakWasmConfig `json:"connection_leak"`
	Match               MatchWasmConfig      `json:"match"`
	Canary              CanaryWasmConfig     `json:"canary"`
	Delay               *DelayWasmConfig     `json:"delay,omitempty"`
	Abort               *AbortWasmConfig     `json:"abort,omitempty"`
}

type ConnectionLeakWasmConfig struct {
	Enabled             bool  `json:"enabled"`
	CheckIntervalMS     int64 `json:"check_interval_ms"`
	MaxConnectionGrowth int   `json:"max_connection_growth"`
	LeakThreshold       int   `json:"leak_threshold"`
	ForceCleanupEnabled bool  `json:"force_cleanup_enabled"`
}

type MatchWasmConfig struct {
	Headers    map[string]StringMatchWasm `json:"headers,omitempty"`
	Percentage float64                    `json:"percentage"`
}

type StringMatchWasm struct {
	Exact  string `json:"exact,omitempty"`
	Prefix string `json:"prefix,omitempty"`
	Regex  string `json:"regex,omitempty"`
}

type CanaryWasmConfig struct {
	Enabled bool              `json:"enabled"`
	Headers map[string]string `json:"headers,omitempty"`
}

type DelayWasmConfig struct {
	DelayType    string `json:"delay_type"`
	FixedMS      int64  `json:"fixed_ms,omitempty"`
	MeanMS       int64  `json:"mean_ms,omitempty"`
	StdDevMS     int64  `json:"std_dev_ms,omitempty"`
	MinMS        int64  `json:"min_ms,omitempty"`
	MaxMS        int64  `json:"max_ms,omitempty"`
	JitterMinMS  int64  `json:"jitter_min_ms,omitempty"`
	JitterMaxMS  int64  `json:"jitter_max_ms,omitempty"`
}

type AbortWasmConfig struct {
	AbortType  string `json:"abort_type"`
	HTTPStatus int    `json:"http_status,omitempty"`
	Message    string `json:"message,omitempty"`
}

func convertHeaders(headers map[string]models.StringMatch) map[string]StringMatchWasm {
	result := make(map[string]StringMatchWasm)
	for k, v := range headers {
		result[k] = StringMatchWasm{
			Exact:  v.Exact,
			Prefix: v.Prefix,
			Regex:  v.Regex,
		}
	}
	return result
}

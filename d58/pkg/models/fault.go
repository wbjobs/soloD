package models

import (
	"time"

	"github.com/google/uuid"
)

type FaultType string

const (
	FaultTypeDelay        FaultType = "delay"
	FaultTypeAbort        FaultType = "abort"
	FaultTypeDisconnect   FaultType = "disconnect"
	FaultTypeRateLimit    FaultType = "rate_limit"
)

type FaultRule struct {
	ID                    string                `json:"id" yaml:"id"`
	Name                  string                `json:"name" yaml:"name"`
	Description           string                `json:"description,omitempty" yaml:"description,omitempty"`
	Namespace             string                `json:"namespace" yaml:"namespace"`
	Service               string                `json:"service" yaml:"service"`
	Enabled               bool                  `json:"enabled" yaml:"enabled"`
	CanaryMode            CanaryConfig          `json:"canary_mode" yaml:"canary_mode"`
	Match                 MatchConfig           `json:"match" yaml:"match"`
	Fault                 FaultConfig           `json:"fault" yaml:"fault"`
	TimeoutAware          TimeoutAwareConfig    `json:"timeout_aware" yaml:"timeout_aware"`
	ConnectionLeakDetect  ConnectionLeakConfig  `json:"connection_leak_detect" yaml:"connection_leak_detect"`
	Version               int64                 `json:"version" yaml:"version"`
	CreatedAt             time.Time             `json:"created_at" yaml:"created_at"`
	UpdatedAt             time.Time             `json:"updated_at" yaml:"updated_at"`
	CreatedBy             string                `json:"created_by,omitempty" yaml:"created_by,omitempty"`
}

func NewFaultRule() *FaultRule {
	return &FaultRule{
		ID:        uuid.New().String(),
		Version:   1,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
		TimeoutAware: TimeoutAwareConfig{
			Enabled:             true,
			TimeoutThresholdPct: 80.0,
			DefaultTimeoutMS:    30000,
			ReadFromDestinationRule: true,
		},
		ConnectionLeakDetect: ConnectionLeakConfig{
			Enabled:             true,
			CheckIntervalMS:     5000,
			MaxConnectionGrowth: 50,
			LeakThreshold:       100,
			ForceCleanupEnabled: true,
		},
	}
}

type CanaryConfig struct {
	Enabled bool              `json:"enabled" yaml:"enabled"`
	Header  map[string]string `json:"header,omitempty" yaml:"header,omitempty"`
}

type MatchConfig struct {
	Headers       map[string]StringMatch `json:"headers,omitempty" yaml:"headers,omitempty"`
	SourceIP      []string               `json:"source_ip,omitempty" yaml:"source_ip,omitempty"`
	TimeWindow    *TimeWindow            `json:"time_window,omitempty" yaml:"time_window,omitempty"`
	Percentage    float64                `json:"percentage,omitempty" yaml:"percentage,omitempty"`
	Paths         []StringMatch          `json:"paths,omitempty" yaml:"paths,omitempty"`
	UserIDs       []string               `json:"user_ids,omitempty" yaml:"user_ids,omitempty"`
}

type StringMatch struct {
	Exact  string `json:"exact,omitempty" yaml:"exact,omitempty"`
	Prefix string `json:"prefix,omitempty" yaml:"prefix,omitempty"`
	Regex  string `json:"regex,omitempty" yaml:"regex,omitempty"`
}

type TimeWindow struct {
	StartTime string `json:"start_time" yaml:"start_time"`
	EndTime   string `json:"end_time" yaml:"end_time"`
	Timezone  string `json:"timezone,omitempty" yaml:"timezone,omitempty"`
}

type FaultConfig struct {
	Type       FaultType          `json:"type" yaml:"type"`
	Delay      *DelayFault        `json:"delay,omitempty" yaml:"delay,omitempty"`
	Abort      *AbortFault        `json:"abort,omitempty" yaml:"abort,omitempty"`
	Disconnect *DisconnectFault   `json:"disconnect,omitempty" yaml:"disconnect,omitempty"`
	RateLimit  *RateLimitFault    `json:"rate_limit,omitempty" yaml:"rate_limit,omitempty"`
}

type DelayType string

const (
	DelayTypeFixed     DelayType = "fixed"
	DelayTypeNormal    DelayType = "normal"
	DelayTypeJitter    DelayType = "jitter"
)

type DelayFault struct {
	DelayType DelayType      `json:"delay_type" yaml:"delay_type"`
	Fixed     *FixedDelay    `json:"fixed,omitempty" yaml:"fixed,omitempty"`
	Normal    *NormalDelay   `json:"normal,omitempty" yaml:"normal,omitempty"`
	Jitter    *JitterDelay   `json:"jitter,omitempty" yaml:"jitter,omitempty"`
}

type FixedDelay struct {
	DurationMS int64 `json:"duration_ms" yaml:"duration_ms"`
}

type NormalDelay struct {
	MeanMS    int64   `json:"mean_ms" yaml:"mean_ms"`
	StdDevMS  int64   `json:"std_dev_ms" yaml:"std_dev_ms"`
	MinMS     int64   `json:"min_ms,omitempty" yaml:"min_ms,omitempty"`
	MaxMS     int64   `json:"max_ms,omitempty" yaml:"max_ms,omitempty"`
}

type JitterDelay struct {
	MinMS int64 `json:"min_ms" yaml:"min_ms"`
	MaxMS int64 `json:"max_ms" yaml:"max_ms"`
}

type AbortType string

const (
	AbortTypeHTTPStatus AbortType = "http_status"
	AbortTypeDNSFailure AbortType = "dns_failure"
)

type AbortFault struct {
	AbortType  AbortType `json:"abort_type" yaml:"abort_type"`
	HTTPStatus *int      `json:"http_status,omitempty" yaml:"http_status,omitempty"`
	Message    string    `json:"message,omitempty" yaml:"message,omitempty"`
}

type DisconnectType string

const (
	DisconnectTypeTCPReset     DisconnectType = "tcp_reset"
	DisconnectTypePoolExhausted DisconnectType = "pool_exhausted"
)

type DisconnectFault struct {
	DisconnectType DisconnectType `json:"disconnect_type" yaml:"disconnect_type"`
}

type RateLimitDimension string

const (
	RateLimitByService RateLimitDimension = "service"
	RateLimitByPath    RateLimitDimension = "path"
	RateLimitByUser    RateLimitDimension = "user"
)

type RateLimitFault struct {
	Dimension RateLimitDimension `json:"dimension" yaml:"dimension"`
	MaxRequests int64            `json:"max_requests" yaml:"max_requests"`
	WindowSeconds int64          `json:"window_seconds" yaml:"window_seconds"`
	Path        string           `json:"path,omitempty" yaml:"path,omitempty"`
	UserHeader  string           `json:"user_header,omitempty" yaml:"user_header,omitempty"`
}

type TimeoutAwareConfig struct {
	Enabled             bool   `json:"enabled" yaml:"enabled"`
	TimeoutThresholdPct float64 `json:"timeout_threshold_pct" yaml:"timeout_threshold_pct"`
	DefaultTimeoutMS    int64  `json:"default_timeout_ms" yaml:"default_timeout_ms"`
	ReadFromDestinationRule bool `json:"read_from_destination_rule" yaml:"read_from_destination_rule"`
}

type ConnectionLeakConfig struct {
	Enabled             bool  `json:"enabled" yaml:"enabled"`
	CheckIntervalMS     int64 `json:"check_interval_ms" yaml:"check_interval_ms"`
	MaxConnectionGrowth int   `json:"max_connection_growth" yaml:"max_connection_growth"`
	LeakThreshold       int   `json:"leak_threshold" yaml:"leak_threshold"`
	ForceCleanupEnabled bool  `json:"force_cleanup_enabled" yaml:"force_cleanup_enabled"`
}

type WasmFilterConfig struct {
	Enabled       bool   `json:"enabled" yaml:"enabled"`
	Image         string `json:"image,omitempty" yaml:"image,omitempty"`
	PluginName    string `json:"plugin_name,omitempty" yaml:"plugin_name,omitempty"`
	RootContextID string `json:"root_context_id,omitempty" yaml:"root_context_id,omitempty"`
}

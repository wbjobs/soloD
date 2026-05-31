package models

import (
	"time"

	"github.com/google/uuid"
)

type FaultLog struct {
	ID             string    `json:"id" yaml:"id"`
	RuleID         string    `json:"rule_id" yaml:"rule_id"`
	RuleName       string    `json:"rule_name" yaml:"rule_name"`
	RuleVersion    int64     `json:"rule_version" yaml:"rule_version"`
	FaultType      FaultType `json:"fault_type" yaml:"fault_type"`
	RequestID      string    `json:"request_id,omitempty" yaml:"request_id,omitempty"`
	SourceIP       string    `json:"source_ip,omitempty" yaml:"source_ip,omitempty"`
	Destination    string    `json:"destination,omitempty" yaml:"destination,omitempty"`
	Path           string    `json:"path,omitempty" yaml:"path,omitempty"`
	Method         string    `json:"method,omitempty" yaml:"method,omitempty"`
	UserID         string    `json:"user_id,omitempty" yaml:"user_id,omitempty"`
	Headers        map[string]string `json:"headers,omitempty" yaml:"headers,omitempty"`
	TriggeredAt    time.Time `json:"triggered_at" yaml:"triggered_at"`
	ImpactDetails  map[string]interface{} `json:"impact_details,omitempty" yaml:"impact_details,omitempty"`
}

func NewFaultLog(rule *FaultRule) *FaultLog {
	return &FaultLog{
		ID:          uuid.New().String(),
		RuleID:      rule.ID,
		RuleName:    rule.Name,
		RuleVersion: rule.Version,
		FaultType:   rule.Fault.Type,
		TriggeredAt: time.Now(),
	}
}

type RuleVersion struct {
	ID        string    `json:"id" yaml:"id"`
	RuleID    string    `json:"rule_id" yaml:"rule_id"`
	Version   int64     `json:"version" yaml:"version"`
	Data      *FaultRule `json:"data" yaml:"data"`
	CreatedAt time.Time `json:"created_at" yaml:"created_at"`
	CreatedBy string    `json:"created_by,omitempty" yaml:"created_by,omitempty"`
}

func NewRuleVersion(rule *FaultRule) *RuleVersion {
	return &RuleVersion{
		ID:        uuid.New().String(),
		RuleID:    rule.ID,
		Version:   rule.Version,
		Data:      rule,
		CreatedAt: time.Now(),
	}
}

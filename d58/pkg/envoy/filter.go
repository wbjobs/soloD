package envoy

import (
	"encoding/json"
	"fmt"

	"istio-fault-injection-engine/pkg/models"
	"istio-fault-injection-engine/pkg/wasm"
	networkingv1alpha3 "istio.io/api/networking/v1alpha3"
	"gopkg.in/yaml.v3"
)

type EnvoyFilterGenerator struct {
	wasmGenerator *wasm.WasmFilterGenerator
}

func NewEnvoyFilterGenerator() *EnvoyFilterGenerator {
	return &EnvoyFilterGenerator{
		wasmGenerator: wasm.NewWasmFilterGenerator(),
	}
}

type EnvoyFilter struct {
	APIVersion string                 `yaml:"apiVersion"`
	Kind       string                 `yaml:"kind"`
	Metadata   Metadata               `yaml:"metadata"`
	Spec       map[string]interface{} `yaml:"spec"`
}

type Metadata struct {
	Name      string            `yaml:"name"`
	Namespace string            `yaml:"namespace"`
	Labels    map[string]string `yaml:"labels,omitempty"`
}

type FilterType string

const (
	FilterTypeWASM  FilterType = "wasm"
	FilterTypeLua   FilterType = "lua"
	FilterTypeFault FilterType = "fault"
)

func (g *EnvoyFilterGenerator) GenerateFromRule(rule *models.FaultRule) ([]byte, error) {
	return g.GenerateWasmFilter(rule)
}

func (g *EnvoyFilterGenerator) GenerateWasmFilter(rule *models.FaultRule) ([]byte, error) {
	filterName := fmt.Sprintf("fault-injection-%s", rule.ID)

	config, err := g.wasmGenerator.GenerateConfiguration(rule)
	if err != nil {
		return nil, err
	}

	spec := map[string]interface{}{
		"workloadSelector": map[string]interface{}{
			"labels": map[string]string{
				"service": rule.Service,
			},
		},
		"configPatches": []map[string]interface{}{
			{
				"applyTo": "HTTP_FILTER",
				"match": map[string]interface{}{
					"context": "SIDECAR_INBOUND",
					"cluster": map[string]interface{}{
						"service": rule.Namespace + "/" + rule.Service,
					},
					"listener": map[string]interface{}{
						"filterChain": map[string]interface{}{
							"filter": map[string]interface{}{
								"name": "envoy.filters.network.http_connection_manager",
								"subFilter": map[string]interface{}{
									"name": "envoy.filters.http.router",
								},
							},
						},
					},
				},
				"patch": map[string]interface{}{
					"operation": "INSERT_BEFORE",
					"value": map[string]interface{}{
						"name": "envoy.filters.http.wasm",
						"typedConfig": map[string]interface{}{
							"@type": "type.googleapis.com/envoy.extensions.filters.http.wasm.v3.Wasm",
							"config": map[string]interface{}{
								"name":   "fault_injection_filter",
								"rootId": "fault_injection_root",
								"vm": map[string]interface{}{
									"vmId": "fault_injection_vm",
									"runtime": "envoy.wasm.runtime.v8",
									"code": map[string]interface{}{
										"remote": map[string]interface{}{
											"httpUri": map[string]interface{}{
												"uri":     "https://your-registry/fault-injection-wasm-filter.wasm",
												"timeout": "60s",
											},
											"sha256": "",
										},
									},
								},
								"configuration": map[string]interface{}{
									"@type": "type.googleapis.com/google.protobuf.StringValue",
									"value":  config,
								},
							},
						},
					},
				},
			},
		},
	}

	filter := &EnvoyFilter{
		APIVersion: "networking.istio.io/v1alpha3",
		Kind:       "EnvoyFilter",
		Metadata: Metadata{
			Name:      filterName,
			Namespace: rule.Namespace,
			Labels: map[string]string{
				"fault-injection-rule": rule.ID,
				"managed-by":           "fault-injection-engine",
				"filter-type":          "wasm",
			},
		},
		Spec: spec,
	}

	return yaml.Marshal(filter)
}

func (g *EnvoyFilterGenerator) GenerateLuaFilter(rule *models.FaultRule) ([]byte, error) {
	luaScript := g.generateLuaScript(rule)
	filterName := fmt.Sprintf("fault-injection-lua-%s", rule.ID)

	spec := map[string]interface{}{
		"workloadSelector": map[string]interface{}{
			"labels": map[string]string{
				"service": rule.Service,
			},
		},
		"configPatches": []map[string]interface{}{
			{
				"applyTo": "HTTP_FILTER",
				"match": map[string]interface{}{
					"context": "SIDECAR_INBOUND",
				},
				"patch": map[string]interface{}{
					"operation": "INSERT_BEFORE",
					"value": map[string]interface{}{
						"name": "envoy.filters.http.lua",
						"typedConfig": map[string]interface{}{
							"@type": "type.googleapis.com/envoy.extensions.filters.http.lua.v3.Lua",
							"inlineCode": luaScript,
						},
					},
				},
			},
		},
	}

	filter := &EnvoyFilter{
		APIVersion: "networking.istio.io/v1alpha3",
		Kind:       "EnvoyFilter",
		Metadata: Metadata{
			Name:      filterName,
			Namespace: rule.Namespace,
			Labels: map[string]string{
				"fault-injection-rule": rule.ID,
				"managed-by":           "fault-injection-engine",
				"filter-type":          "lua",
			},
		},
		Spec: spec,
	}

	return yaml.Marshal(filter)
}

func (g *EnvoyFilterGenerator) GenerateNativeFaultFilter(rule *models.FaultRule) ([]byte, error) {
	filterName := fmt.Sprintf("fault-injection-native-%s", rule.ID)

	spec := map[string]interface{}{
		"workloadSelector": map[string]interface{}{
			"labels": map[string]string{
				"service": rule.Service,
			},
		},
		"configPatches": []map[string]interface{}{
			{
				"applyTo": "HTTP_FILTER",
				"match": map[string]interface{}{
					"context": "SIDECAR_INBOUND",
					"cluster": map[string]interface{}{
						"service": rule.Namespace + "/" + rule.Service,
					},
				},
				"patch": map[string]interface{}{
					"operation": "INSERT_BEFORE",
					"value":     g.buildHTTPFaultFilter(rule),
				},
			},
		},
	}

	filter := &EnvoyFilter{
		APIVersion: "networking.istio.io/v1alpha3",
		Kind:       "EnvoyFilter",
		Metadata: Metadata{
			Name:      filterName,
			Namespace: rule.Namespace,
			Labels: map[string]string{
				"fault-injection-rule": rule.ID,
				"managed-by":           "fault-injection-engine",
				"filter-type":          "native-fault",
			},
		},
		Spec: spec,
	}

	return yaml.Marshal(filter)
}

func (g *EnvoyFilterGenerator) buildHTTPFaultFilter(rule *models.FaultRule) map[string]interface{} {
	faultConfig := make(map[string]interface{})

	switch rule.Fault.Type {
	case models.FaultTypeDelay:
		faultConfig["delay"] = g.buildDelayFault(rule.Fault.Delay)
	case models.FaultTypeAbort:
		faultConfig["abort"] = g.buildAbortFault(rule.Fault.Abort)
	}

	if rule.Match.Percentage > 0 {
		faultConfig["percentage"] = map[string]interface{}{
			"numerator":   int(rule.Match.Percentage * 100),
			"denominator": "TEN_THOUSAND",
		}
	}

	headers := make([]map[string]interface{}, 0)
	for key, match := range rule.Match.Headers {
		headerMatch := map[string]interface{}{
			"name": key,
		}
		if match.Exact != "" {
			headerMatch["exactMatch"] = match.Exact
		} else if match.Prefix != "" {
			headerMatch["prefixMatch"] = match.Prefix
		} else if match.Regex != "" {
			headerMatch["regexMatch"] = match.Regex
		}
		headers = append(headers, headerMatch)
	}

	if rule.CanaryMode.Enabled {
		for key, value := range rule.CanaryMode.Header {
			headers = append(headers, map[string]interface{}{
				"name":       key,
				"exactMatch": value,
			})
		}
	}

	if len(headers) > 0 {
		faultConfig["headers"] = headers
	}

	return map[string]interface{}{
		"name": "envoy.filters.http.fault",
		"typedConfig": map[string]interface{}{
			"@type": "type.googleapis.com/envoy.extensions.filters.http.fault.v3.HTTPFault",
			"fault": faultConfig,
		},
	}
}

func (g *EnvoyFilterGenerator) buildDelayFault(delay *models.DelayFault) map[string]interface{} {
	if delay == nil {
		return nil
	}

	fixedDelay := &models.FixedDelay{DurationMS: 0}
	switch delay.DelayType {
	case models.DelayTypeFixed:
		if delay.Fixed != nil {
			fixedDelay = delay.Fixed
		}
	case models.DelayTypeNormal:
		if delay.Normal != nil {
			fixedDelay = &models.FixedDelay{DurationMS: delay.Normal.MeanMS}
		}
	case models.DelayTypeJitter:
		if delay.Jitter != nil {
			fixedDelay = &models.FixedDelay{DurationMS: (delay.Jitter.MinMS + delay.Jitter.MaxMS) / 2}
		}
	}

	return map[string]interface{}{
		"fixedDelay": fmt.Sprintf("%ds", fixedDelay.DurationMS/1000) + fmt.Sprintf("%dms", fixedDelay.DurationMS%1000),
	}
}

func (g *EnvoyFilterGenerator) buildAbortFault(abort *models.AbortFault) map[string]interface{} {
	if abort == nil {
		return nil
	}

	status := 500
	if abort.HTTPStatus != nil {
		status = *abort.HTTPStatus
	}

	return map[string]interface{}{
		"httpStatus": status,
	}
}

func (g *EnvoyFilterGenerator) generateLuaScript(rule *models.FaultRule) string {
	return fmt.Sprintf(`
function envoy_on_request(request_handle)
  local headers = request_handle:headers()
  local rule_id = "%s"
  local fault_type = "%s"
  local enabled = %s
  
  if not enabled then
    return
  end

  -- Canary check
  local canary_enabled = %s
  if canary_enabled then
    %s
  end

  -- Percentage match
  local percentage = %f
  if percentage > 0 and math.random() * 100 > percentage then
    return
  end

  -- Timeout aware delay injection configuration
  local timeout_threshold_pct = %f
  local default_timeout_ms = %d
  local timeout_aware_enabled = %s

  if fault_type == "delay" then
    local delay_ms = %d
    local threshold_ms = default_timeout_ms * timeout_threshold_pct / 100

    if timeout_aware_enabled and delay_ms > threshold_ms then
      request_handle:respond(
        {[":status"] = "504"},
        "Gateway Timeout - Fault Injection Protection"
      )
      return
    end

    local start_time = os.clock()
    while os.clock() - start_time < delay_ms / 1000 do
    end

  elseif fault_type == "abort" then
    local status = %d
    local message = "%s"
    request_handle:respond(
      {[":status"] = tostring(status)},
      message
    )
  end
end

function envoy_on_response(response_handle)
  local headers = response_handle:headers()
  headers:add("x-fault-injection-version", "1.0")
end
`,
		rule.ID,
		rule.Fault.Type,
		g.luaBool(rule.Enabled),
		g.luaBool(rule.CanaryMode.Enabled),
		g.generateCanaryCheck(rule.CanaryMode),
		rule.Match.Percentage,
		rule.TimeoutAware.TimeoutThresholdPct,
		rule.TimeoutAware.DefaultTimeoutMS,
		g.luaBool(rule.TimeoutAware.Enabled),
		g.getDelayMS(rule.Fault.Delay),
		g.getAbortStatus(rule.Fault.Abort),
		g.getAbortMessage(rule.Fault.Abort),
	)
}

func (g *EnvoyFilterGenerator) luaBool(b bool) string {
	if b {
		return "true"
	}
	return "false"
}

func (g *EnvoyFilterGenerator) generateCanaryCheck(canary models.CanaryConfig) string {
	checks := ""
	for key, value := range canary.Header {
		checks += fmt.Sprintf(`if headers:get("%s") ~= "%s" then return end `, key, value)
	}
	return checks
}

func (g *EnvoyFilterGenerator) getDelayMS(delay *models.DelayFault) int64 {
	if delay == nil {
		return 0
	}
	switch delay.DelayType {
	case models.DelayTypeFixed:
		if delay.Fixed != nil {
			return delay.Fixed.DurationMS
		}
	case models.DelayTypeNormal:
		if delay.Normal != nil {
			return delay.Normal.MeanMS
		}
	case models.DelayTypeJitter:
		if delay.Jitter != nil {
			return (delay.Jitter.MinMS + delay.Jitter.MaxMS) / 2
		}
	}
	return 0
}

func (g *EnvoyFilterGenerator) getAbortStatus(abort *models.AbortFault) int {
	if abort == nil || abort.HTTPStatus == nil {
		return 500
	}
	return *abort.HTTPStatus
}

func (g *EnvoyFilterGenerator) getAbortMessage(abort *models.AbortFault) string {
	if abort == nil || abort.Message == "" {
		return "Service Unavailable - Fault Injection"
	}
	return abort.Message
}

func (g *EnvoyFilterGenerator) GenerateJSON(rule *models.FaultRule) ([]byte, error) {
	config := g.buildFaultInjectionConfig(rule)
	return json.MarshalIndent(config, "", "  ")
}

func (g *EnvoyFilterGenerator) buildFaultInjectionConfig(rule *models.FaultRule) map[string]interface{} {
	config := map[string]interface{}{
		"rule_id":   rule.ID,
		"rule_name": rule.Name,
		"service":   rule.Service,
		"namespace": rule.Namespace,
		"enabled":   rule.Enabled,
		"fault": map[string]interface{}{
			"type": rule.Fault.Type,
		},
		"match": map[string]interface{}{
			"percentage": rule.Match.Percentage,
		},
		"canary": map[string]interface{}{
			"enabled": rule.CanaryMode.Enabled,
		},
		"timeout_aware": map[string]interface{}{
			"enabled":               rule.TimeoutAware.Enabled,
			"threshold_percentage":  rule.TimeoutAware.TimeoutThresholdPct,
			"default_timeout_ms":    rule.TimeoutAware.DefaultTimeoutMS,
			"read_destination_rule": rule.TimeoutAware.ReadFromDestinationRule,
		},
		"connection_leak": map[string]interface{}{
			"enabled":               rule.ConnectionLeakDetect.Enabled,
			"check_interval_ms":     rule.ConnectionLeakDetect.CheckIntervalMS,
			"max_connection_growth": rule.ConnectionLeakDetect.MaxConnectionGrowth,
			"leak_threshold":        rule.ConnectionLeakDetect.LeakThreshold,
			"force_cleanup_enabled": rule.ConnectionLeakDetect.ForceCleanupEnabled,
		},
	}

	if rule.CanaryMode.Enabled {
		config["canary"].(map[string]interface{})["headers"] = rule.CanaryMode.Header
	}

	return config
}

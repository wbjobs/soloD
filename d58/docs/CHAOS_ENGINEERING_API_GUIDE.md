# 混沌工程推荐引擎 API 使用指南

## 概述

基于 AI 的混沌工程实验推荐引擎提供以下核心功能：

1. **Prometheus 指标采集** - 收集服务黄金指标（延迟、流量、错误、饱和度）
2. **孤立森林异常检测** - 自动识别系统薄弱环节
3. **智能实验推荐** - 基于检测结果生成故障实验组合
4. **一键执行与自动回滚** - 安全执行混沌实验
5. **实时监控与 SLO 检测** - 实验过程中监控系统健康
6. **报告生成** - 自动生成实验报告和改进建议

## API 端点总览

| 类别 | 端点 | 方法 | 描述 |
|------|------|------|------|
| **指标** | `/api/v1/chaos/metrics/services/{namespace}` | GET | 获取服务黄金指标 |
| **指标** | `/api/v1/chaos/metrics/dependencies/{namespace}` | GET | 获取服务依赖关系 |
| **指标** | `/api/v1/chaos/metrics/anomalies/{namespace}` | GET | 检测服务异常 |
| **推荐** | `/api/v1/chaos/recommendations/generate/{namespace}` | POST | 生成实验推荐 |
| **推荐** | `/api/v1/chaos/recommendations` | GET | 列出所有推荐 |
| **推荐** | `/api/v1/chaos/recommendations/{id}` | GET | 获取单个推荐 |
| **执行** | `/api/v1/chaos/executions` | POST | 创建实验执行 |
| **执行** | `/api/v1/chaos/executions` | GET | 列出所有执行 |
| **执行** | `/api/v1/chaos/executions/{id}` | GET | 获取执行状态 |
| **执行** | `/api/v1/chaos/executions/{id}/start` | POST | 启动实验 |
| **执行** | `/api/v1/chaos/executions/{id}/pause` | POST | 暂停实验 |
| **执行** | `/api/v1/chaos/executions/{id}/stop` | POST | 停止实验 |
| **执行** | `/api/v1/chaos/executions/{id}/rollback` | POST | 手动回滚 |
| **执行** | `/api/v1/chaos/executions/{id}/report` | GET | 生成实验报告 |
| **配置** | `/api/v1/chaos/config` | GET | 获取配置 |
| **配置** | `/api/v1/chaos/config` | POST | 更新配置 |

## 详细 API 文档

### 1. 获取服务黄金指标

**请求：**
```bash
curl http://localhost:8080/api/v1/chaos/metrics/services/default
```

**响应：**
```json
{
  "data": [
    {
      "service_name": "payment-service",
      "namespace": "default",
      "latency_p50_ms": 150.5,
      "latency_p95_ms": 450.2,
      "latency_p99_ms": 800.1,
      "error_rate_percent": 1.5,
      "traffic_qps": 250.0,
      "saturation_percent": 45.0,
      "cpu_usage_percent": 65.0,
      "memory_usage_percent": 55.0,
      "pod_count": 3,
      "timestamp": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### 2. 获取服务依赖关系

**请求：**
```bash
curl http://localhost:8080/api/v1/chaos/metrics/dependencies/default
```

**响应：**
```json
{
  "data": [
    {
      "source_service": "api-gateway",
      "target_service": "payment-service",
      "call_count": 15000,
      "error_rate": 1.2,
      "avg_latency_ms": 200.0
    },
    {
      "source_service": "payment-service",
      "target_service": "fraud-detection",
      "call_count": 8000,
      "error_rate": 2.5,
      "avg_latency_ms": 350.0
    }
  ]
}
```

### 3. 检测服务异常

**请求：**
```bash
curl http://localhost:8080/api/v1/chaos/metrics/anomalies/default
```

**响应：**
```json
{
  "weak_points": [
    {
      "id": "wp-abc123",
      "service_name": "payment-service",
      "namespace": "default",
      "metric_type": "latency",
      "anomaly_score": 0.78,
      "severity": "high",
      "description": "High P95 latency detected - 1200ms vs historical baseline of 300ms",
      "historical_data": {
        "latency_p95_ms": 1200.0,
        "error_rate_percent": 2.5
      },
      "detected_at": "2024-01-15T10:30:00Z"
    }
  ],
  "scores": {
    "payment-service": 0.78,
    "fraud-detection": 0.55,
    "api-gateway": 0.20
  }
}
```

### 4. 生成实验推荐

**请求：**
```bash
curl -X POST http://localhost:8080/api/v1/chaos/recommendations/generate/default
```

**响应：**
```json
{
  "data": [
    {
      "id": "rec-xyz789",
      "name": "payment-service-resilience-test",
      "description": "Detected anomalies: latency (high severity), error_rate (medium severity)",
      "weak_points": [
        {
          "id": "wp-abc123",
          "service_name": "payment-service",
          "metric_type": "latency",
          "anomaly_score": 0.78,
          "severity": "high"
        }
      ],
      "fault_combinations": [
        {
          "id": "fault-001",
          "target_service": "payment-service",
          "fault_type": "delay",
          "duration_seconds": 300,
          "match_percentage": 30.0,
          "expected_impact": "Increase latency to validate circuit breaker behavior"
        },
        {
          "id": "fault-002",
          "target_service": "fraud-detection",
          "fault_type": "abort",
          "duration_seconds": 180,
          "match_percentage": 20.0,
          "expected_impact": "Validate fallback mechanism when downstream fails"
        }
      ],
      "impact_radius": {
        "estimated_affected_services": 4,
        "estimated_traffic_impact_percent": 30.0,
        "estimated_error_rate_increase_percent": 15.0,
        "estimated_latency_increase_ms": 1500.0,
        "risk_level": "high",
        "recommended_blast_radius_percent": 30.0
      },
      "estimated_rollback_time_seconds": 120,
      "priority": 1,
      "confidence_score": 0.85,
      "generated_at": "2024-01-15T10:30:00Z",
      "status": "pending"
    }
  ]
}
```

### 5. 创建并执行实验

**步骤 1: 创建执行**
```bash
curl -X POST http://localhost:8080/api/v1/chaos/executions \
  -H "Content-Type: application/json" \
  -d '{"recommendation_id": "rec-xyz789"}'
```

**响应：**
```json
{
  "execution_id": "exec-def456"
}
```

**步骤 2: 启动实验**
```bash
curl -X POST http://localhost:8080/api/v1/chaos/executions/exec-def456/start
```

**响应：**
```json
{
  "status": "started"
}
```

### 6. 获取执行状态

**请求：**
```bash
curl http://localhost:8080/api/v1/chaos/executions/exec-def456
```

**响应：**
```json
{
  "id": "exec-def456",
  "recommendation_id": "rec-xyz789",
  "name": "payment-service-resilience-test",
  "status": "running",
  "phase": "fault_injection",
  "started_at": "2024-01-15T10:35:00Z",
  "baseline_metrics": {
    "payment-service": {
      "latency_p95_ms": 450.0,
      "error_rate_percent": 1.5
    }
  },
  "current_metrics": {
    "payment-service": {
      "latency_p95_ms": 1800.0,
      "error_rate_percent": 12.5
    }
  },
  "slo_violations": [
    {
      "timestamp": "2024-01-15T10:36:00Z",
      "metric_type": "latency_increase",
      "threshold": 200.0,
      "actual_value": 300.0,
      "severity": "warning",
      "description": "Latency increased by 300% from baseline"
    }
  ],
  "auto_rollback_triggered": false,
  "executed_faults": [
    {
      "fault_id": "fault-001",
      "rule_id": "rule-ghi789",
      "target_service": "payment-service",
      "fault_type": "delay",
      "started_at": "2024-01-15T10:35:00Z",
      "status": "active"
    }
  ],
  "created_at": "2024-01-15T10:34:00Z"
}
```

### 7. 生成实验报告

**请求：**
```bash
curl http://localhost:8080/api/v1/chaos/executions/exec-def456/report
```

**响应：**
```json
{
  "id": "report-jkl012",
  "execution_id": "exec-def456",
  "recommendation_id": "rec-xyz789",
  "name": "payment-service-resilience-test",
  "summary": "Experiment completed successfully. 2 faults executed, 1 SLO violations detected",
  "findings": [
    "Detected 1 SLO violations (0 critical)",
    "Circuit breaker triggered correctly for payment-service",
    "Fallback mechanism working as expected for fraud-detection errors"
  ],
  "recommendations": [
    "Review the service's error handling and timeout configurations",
    "Consider implementing retry with exponential backoff",
    "Continue running periodic chaos experiments to maintain resilience"
  ],
  "baseline_metrics": {
    "payment-service": {
      "latency_p95_ms": 450.0,
      "error_rate_percent": 1.5
    }
  },
  "experiment_metrics": {
    "payment-service": {
      "latency_p95_ms": 1800.0,
      "error_rate_percent": 12.5
    }
  },
  "impact_analysis": {
    "estimated_affected_services": 3,
    "estimated_traffic_impact_percent": 28.5,
    "estimated_error_rate_increase_percent": 11.0,
    "estimated_latency_increase_ms": 1350.0,
    "risk_level": "medium"
  },
  "slo_violations": [
    {
      "timestamp": "2024-01-15T10:36:00Z",
      "metric_type": "latency_increase",
      "threshold": 200.0,
      "actual_value": 300.0,
      "severity": "warning"
    }
  ],
  "executed_faults": [
    {
      "fault_id": "fault-001",
      "rule_id": "rule-ghi789",
      "target_service": "payment-service",
      "fault_type": "delay",
      "started_at": "2024-01-15T10:35:00Z",
      "completed_at": "2024-01-15T10:40:00Z",
      "status": "completed"
    }
  ],
  "generated_at": "2024-01-15T10:45:00Z"
}
```

## 完整工作流示例

### 场景：自动发现并验证支付服务韧性问题

```bash
#!/bin/bash

# 1. 检测系统异常
echo "Step 1: Detecting anomalies..."
ANOMALIES=$(curl -s http://localhost:8080/api/v1/chaos/metrics/anomalies/default)
echo "Detected weak points: $(echo $ANOMALIES | jq '.weak_points | length')"

# 2. 生成实验推荐
echo -e "\nStep 2: Generating experiment recommendations..."
RECS=$(curl -s -X POST http://localhost:8080/api/v1/chaos/recommendations/generate/default)
REC_ID=$(echo $RECS | jq -r '.data[0].id')
echo "Generated recommendation ID: $REC_ID"

# 3. 检查推荐的风险等级
RISK=$(echo $RECS | jq -r '.data[0].impact_radius.risk_level')
echo "Recommended risk level: $RISK"

if [ "$RISK" = "high" ]; then
  echo "WARNING: High risk experiment - consider reducing blast radius"
fi

# 4. 创建实验执行
echo -e "\nStep 3: Creating experiment execution..."
EXEC=$(curl -s -X POST http://localhost:8080/api/v1/chaos/executions \
  -H "Content-Type: application/json" \
  -d "{\"recommendation_id\": \"$REC_ID\"}")
EXEC_ID=$(echo $EXEC | jq -r '.execution_id')
echo "Created execution ID: $EXEC_ID"

# 5. 启动实验
echo -e "\nStep 4: Starting experiment..."
curl -s -X POST http://localhost:8080/api/v1/chaos/executions/$EXEC_ID/start

# 6. 监控实验进度
echo -e "\nStep 5: Monitoring experiment progress..."
for i in {1..30}; do
  STATUS=$(curl -s http://localhost:8080/api/v1/chaos/executions/$EXEC_ID)
  EXEC_STATUS=$(echo $STATUS | jq -r '.status')
  EXEC_PHASE=$(echo $STATUS | jq -r '.phase')
  VIOLATIONS=$(echo $STATUS | jq '.slo_violations | length')
  
  echo "[$i/30] Status: $EXEC_STATUS, Phase: $EXEC_PHASE, SLO Violations: $VIOLATIONS"
  
  if [ "$EXEC_STATUS" = "completed" ] || [ "$EXEC_STATUS" = "failed" ]; then
    break
  fi
  
  if [ "$EXEC_STATUS" = "running" ] && [ "$VIOLATIONS" -gt 3 ]; then
    echo "WARNING: Too many SLO violations, triggering manual rollback..."
    curl -s -X POST http://localhost:8080/api/v1/chaos/executions/$EXEC_ID/rollback
    break
  fi
  
  sleep 10
done

# 7. 生成最终报告
echo -e "\nStep 6: Generating experiment report..."
REPORT=$(curl -s http://localhost:8080/api/v1/chaos/executions/$EXEC_ID/report)
echo "Report summary: $(echo $REPORT | jq -r '.summary')"
echo "Findings:"
echo "$REPORT" | jq -r '.findings[]'

echo -e "\nWorkflow completed successfully!"
```

## 配置调整

### 修改 SLO 阈值

```bash
curl -X POST http://localhost:8080/api/v1/chaos/config \
  -H "Content-Type: application/json" \
  -d '{
    "slo": {
      "enabled": true,
      "max_latency_p95_ms": 2000,
      "max_error_rate_percent": 10.0,
      "auto_rollback_enabled": true
    }
  }'
```

### 调整 Prometheus 地址

```bash
curl -X POST http://localhost:8080/api/v1/chaos/config \
  -H "Content-Type: application/json" \
  -d '{
    "prometheus": {
      "address": "http://prometheus.monitoring:9090",
      "query_timeout_seconds": 60
    }
  }'
```

## 最佳实践

1. **从低风险开始** - 先在 staging 环境测试，使用小的爆炸半径
2. **设置合理的 SLO 阈值** - 根据业务需求设置合适的自动回滚触发点
3. **金丝雀模式** - 始终优先使用金丝雀模式验证故障规则
4. **定期执行** - 将混沌实验集成到 CI/CD 流程中定期执行
5. **审查报告** - 每次实验后仔细审查发现和建议，持续改进系统韧性

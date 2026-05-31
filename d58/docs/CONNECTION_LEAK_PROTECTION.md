# 连接泄漏防护机制

## 问题描述

在故障注入场景中，当注入的延迟（例如 5000ms）超过服务的 HTTP 超时设置（例如 3000ms）时，会出现以下问题：

1. **连接泄漏**：请求长时间持有连接资源，直到超时
2. **连接池耗尽**：大量请求被延迟导致无法释放连接
3. **服务级联故障**：上游服务超时引发连锁反应

## 解决方案

我们实现了多层防护机制来解决连接泄漏问题：

### 1. 超时感知延迟注入

**核心机制**：当计算出的延迟超过超时阈值的一定百分比（默认80%）时，提前返回 504 Gateway Timeout 错误并释放连接。

```
注入延迟 (5000ms) > 超时阈值 (3000ms × 80% = 2400ms)
=> 立即返回 504 错误，释放连接
```

**配置参数**：

```json
{
  "timeout_aware": {
    "enabled": true,
    "timeout_threshold_pct": 80.0,
    "default_timeout_ms": 3000,
    "read_from_destination_rule": true
  }
}
```

**字段说明**：
- `enabled`: 是否启用超时感知功能
- `timeout_threshold_pct`: 超时阈值百分比（0-100）
- `default_timeout_ms`: 默认超时时间，当无法读取 DestinationRule 时使用
- `read_from_destination_rule`: 是否尝试从 Istio DestinationRule 读取真实超时配置

### 2. 连接泄漏检测器

**核心机制**：定期检测连接池状态，当检测到异常增长时强制清理连接。

**配置参数**：

```json
{
  "connection_leak_detect": {
    "enabled": true,
    "check_interval_ms": 5000,
    "max_connection_growth": 50,
    "leak_threshold": 100,
    "force_cleanup_enabled": true
  }
}
```

**字段说明**：
- `enabled`: 是否启用连接泄漏检测
- `check_interval_ms`: 检测间隔（毫秒）
- `max_connection_growth`: 允许的最大连接增长数
- `leak_threshold`: 连接泄漏阈值（绝对数量）
- `force_cleanup_enabled`: 是否启用强制清理

### 3. Wasm 过滤器增强

相对于 Lua 脚本，Wasm 过滤器提供以下优势：

- **更好的性能**：原生编译，执行更快
- **访问底层状态**：可以访问连接元数据和超时状态
- **更好的可观测性**：内置 metrics 导出
- **类型安全**：编译时类型检查

**支持的过滤器类型**：

| 类型 | 特点 | 适用场景 |
|------|------|---------|
| `wasm` | 高性能、可观测性好 | 生产环境 |
| `lua` | 简单灵活、易于调试 | 开发测试 |
| `native` | 使用 Envoy 原生故障注入 | 简单场景 |

## 使用示例

### 创建具备超时保护的故障规则

```bash
curl -X POST http://localhost:8080/api/v1/rules \
  -H "Content-Type: application/json" \
  -d @examples/timeout-aware-delay-injection.json
```

### 生成不同类型的 EnvoyFilter

**Wasm 过滤器（推荐）**：
```bash
curl "http://localhost:8080/api/v1/rules/{rule-id}/envoyfilter?type=wasm"
```

**Lua 过滤器**：
```bash
curl "http://localhost:8080/api/v1/rules/{rule-id}/envoyfilter?type=lua"
```

**原生故障过滤器**：
```bash
curl "http://localhost:8080/api/v1/rules/{rule-id}/envoyfilter?type=native"
```

## 工作原理

### 超时感知流程图

```
请求到达
  │
  ▼
计算注入延迟
  │
  ▼
获取超时配置
  ├─ 从 DestinationRule 读取（如果启用）
  └─ 使用默认超时
  │
  ▼
计算阈值 = 超时 × threshold_pct%
  │
  ▼
注入延迟 > 阈值?
  ├─ 是 → 返回 504，立即释放连接
  └─ 否 → 正常注入延迟
```

### 连接泄漏检测流程

```
定时触发检测
  │
  ▼
获取当前连接计数
  │
  ▼
与基线比较
  │
  ▼
是否超过阈值?
  ├─ 是 → 强制清理异常连接，记录日志
  └─ 否 → 更新基线，等待下一次检测
```

## 最佳实践

1. **金丝雀先行**：始终在金丝雀模式下测试故障规则，避免影响生产流量
2. **合理设置阈值**：建议将 `timeout_threshold_pct` 设置在 70-90% 之间
3. **监控告警**：为连接池指标配置告警，及时发现异常
4. **定期检查**：启用连接泄漏检测器，即使启用了超时保护

## 与 DestinationRule 集成

当 `read_from_destination_rule` 启用时，系统会尝试读取 Istio DestinationRule 中的超时配置：

```yaml
apiVersion: networking.istio.io/v1alpha3
kind: DestinationRule
metadata:
  name: productpage
spec:
  host: productpage.default.svc.cluster.local
  trafficPolicy:
    connectionPool:
      http:
        http1MaxPendingRequests: 100
        maxRequestsPerConnection: 10
    tcp:
      maxConnections: 100
      connectTimeout: 3000ms  # 读取此值
```

## 故障日志

触发超时保护时，系统会记录详细的故障日志：

```json
{
  "rule_id": "xxx",
  "fault_type": "delay_timeout_protection",
  "triggered_at": "2024-01-01T00:00:00Z",
  "impact_details": {
    "injected_delay_ms": 5000,
    "timeout_ms": 3000,
    "threshold_ms": 2400,
    "protection_triggered": true
  }
}
```

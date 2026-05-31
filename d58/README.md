# Istio 智能故障注入引擎

基于 Go + Istio EnvoyFilter API 的智能故障注入系统，支持无侵入式模拟多种系统故障。

## 功能特性

### 故障类型

1. **延迟注入**
   - 固定延迟
   - 正态分布延迟
   - 抖动区间延迟

2. **异常码注入**
   - 4xx 错误
   - 5xx 错误
   - DNS 解析失败

3. **连接中断**
   - TCP 重置
   - 连接池耗尽

4. **限流**
   - 按服务限流
   - 按路径限流
   - 按用户限流

### 匹配策略

- 基于 Header 匹配
- 基于来源 IP 匹配
- 基于时间窗口匹配
- 基于流量百分比匹配
- 基于路径匹配
- 基于用户 ID 匹配

### 金丝雀验证

- 仅对携带特定 Header 的请求生效
- 不影响正常生产流量
- 支持灰度发布故障规则

### 管理功能

- RESTful API 管理故障规则
- 规则原子性更新
- 版本历史记录
- 版本回滚
- 故障触发日志记录

## 架构设计

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   API Server    │────▶│  Etcd Storage   │◀────│ EnvoyFilter Gen │
└─────────────────┘     └─────────────────┘     └─────────────────┘
          │                      │
          ▼                      ▼
┌─────────────────┐     ┌─────────────────┐
│  Fault Injector │     │  Versioning     │
└─────────────────┘     └─────────────────┘
```

## 快速开始

### 前置要求

- Go 1.21+
- Etcd 3.5+
- Kubernetes 1.24+
- Istio 1.18+

### 本地运行

1. 启动 Etcd
```bash
docker run -d --name etcd -p 2379:2379 quay.io/coreos/etcd:v3.5.0 \
  /usr/local/bin/etcd \
  --listen-client-urls http://0.0.0.0:2379 \
  --advertise-client-urls http://localhost:2379
```

2. 设置环境变量
```bash
export SERVER_PORT=8080
export ETCD_ENDPOINTS=localhost:2379
export LOG_LEVEL=info
```

3. 运行服务
```bash
go run cmd/server/main.go
```

### Docker 部署

```bash
docker build -t istio-fault-injection-engine .
docker run -p 8080:8080 \
  -e ETCD_ENDPOINTS=your-etcd:2379 \
  istio-fault-injection-engine
```

## API 文档

### 创建故障规则

```bash
POST /api/v1/rules
Content-Type: application/json

{
  "name": "delay-injection-demo",
  "description": "Demo delay injection rule",
  "namespace": "default",
  "service": "productpage",
  "enabled": true,
  "canary_mode": {
    "enabled": true,
    "header": {
      "x-canary-test": "true"
    }
  },
  "match": {
    "percentage": 50.0,
    "headers": {
      "user-agent": {
        "prefix": "Mozilla"
      }
    }
  },
  "fault": {
    "type": "delay",
    "delay": {
      "delay_type": "fixed",
      "fixed": {
        "duration_ms": 1000
      }
    }
  }
}
```

### 获取规则列表

```bash
GET /api/v1/rules?namespace=default&service=productpage
```

### 获取单个规则

```bash
GET /api/v1/rules/{id}
```

### 更新规则

```bash
PUT /api/v1/rules/{id}
Content-Type: application/json

{
  "enabled": false
}
```

### 删除规则

```bash
DELETE /api/v1/rules/{id}
```

### 回滚到指定版本

```bash
POST /api/v1/rules/{id}/versions/{version}/rollback
```

### 获取版本历史

```bash
GET /api/v1/rules/{id}/versions
```

### 生成 EnvoyFilter

```bash
GET /api/v1/rules/{id}/envoyfilter?format=yaml
```

### 记录故障日志

```bash
POST /api/v1/logs
Content-Type: application/json

{
  "rule_id": "rule-uuid",
  "request_id": "req-123",
  "source_ip": "10.0.0.1",
  "path": "/api/v1/products",
  "method": "GET"
}
```

### 健康检查

```bash
GET /api/v1/health
```

## 配置示例

### 1. 固定延迟注入

```json
{
  "name": "fixed-delay",
  "namespace": "default",
  "service": "reviews",
  "enabled": true,
  "match": {
    "percentage": 100.0
  },
  "fault": {
    "type": "delay",
    "delay": {
      "delay_type": "fixed",
      "fixed": {
        "duration_ms": 2000
      }
    }
  }
}
```

### 2. 正态分布延迟

```json
{
  "name": "normal-distribution-delay",
  "namespace": "default",
  "service": "ratings",
  "enabled": true,
  "match": {
    "percentage": 50.0
  },
  "fault": {
    "type": "delay",
    "delay": {
      "delay_type": "normal",
      "normal": {
        "mean_ms": 500,
        "std_dev_ms": 200,
        "min_ms": 100,
        "max_ms": 2000
      }
    }
  }
}
```

### 3. 503 错误注入

```json
{
  "name": "503-error",
  "namespace": "default",
  "service": "details",
  "enabled": true,
  "match": {
    "percentage": 30.0
  },
  "fault": {
    "type": "abort",
    "abort": {
      "abort_type": "http_status",
      "http_status": 503,
      "message": "Service Unavailable"
    }
  }
}
```

### 4. 按用户限流

```json
{
  "name": "rate-limit-by-user",
  "namespace": "default",
  "service": "api-gateway",
  "enabled": true,
  "match": {
    "paths": [
      { "prefix": "/api/" }
    ]
  },
  "fault": {
    "type": "rate_limit",
    "rate_limit": {
      "dimension": "user",
      "max_requests": 100,
      "window_seconds": 60,
      "user_header": "x-user-id"
    }
  }
}
```

### 5. 金丝雀模式

```json
{
  "name": "canary-fault-test",
  "namespace": "default",
  "service": "productpage",
  "enabled": true,
  "canary_mode": {
    "enabled": true,
    "header": {
      "x-fault-test": "enabled",
      "x-env": "staging"
    }
  },
  "match": {
    "percentage": 100.0
  },
  "fault": {
    "type": "delay",
    "delay": {
      "delay_type": "jitter",
      "jitter": {
        "min_ms": 500,
        "max_ms": 1500
      }
    }
  }
}
```

## 应用 EnvoyFilter

1. 生成 EnvoyFilter 配置
```bash
curl "http://localhost:8080/api/v1/rules/{id}/envoyfilter" > envoyfilter.yaml
```

2. 应用到 Kubernetes
```bash
kubectl apply -f envoyfilter.yaml
```

## 项目结构

```
istio-fault-injection-engine/
├── cmd/
│   └── server/
│       └── main.go           # 主服务入口
├── pkg/
│   ├── models/
│   │   ├── fault.go          # 故障规则数据模型
│   │   └── log.go            # 日志数据模型
│   ├── storage/
│   │   └── etcd.go           # Etcd 存储层
│   ├── matcher/
│   │   └── matcher.go        # 请求匹配器
│   ├── fault/
│   │   └── injector.go       # 故障注入核心逻辑
│   ├── envoy/
│   │   └── filter.go         # EnvoyFilter 生成器
│   ├── api/
│   │   └── handler.go        # REST API 处理器
│   └── logger/
│       └── logger.go         # 日志记录
├── configs/
│   └── config.yaml           # 配置文件
├── Dockerfile
├── go.mod
├── go.sum
└── README.md
```

## 配置说明

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| SERVER_PORT | 服务端口 | 8080 |
| ETCD_ENDPOINTS | Etcd 端点列表，逗号分隔 | localhost:2379 |
| LOG_LEVEL | 日志级别 (debug/info/warn/error) | info |

## 监控与观测

### 日志格式

服务会记录所有故障注入事件，包含：
- 规则 ID 和版本
- 请求标识
- 来源 IP 和目标服务
- 请求路径和方法
- 触发时间
- 影响详情

### 指标建议

建议配置以下 Prometheus 指标：
- `fault_injection_triggered_total`: 故障触发总次数
- `fault_injection_rules_active`: 活跃规则数量
- `fault_injection_latency_seconds`: 故障注入延迟分布

## 最佳实践

1. **金丝雀先行**: 始终在金丝雀模式下测试故障规则
2. **从小流量开始**: 从低百分比开始，逐步增加
3. **设置合理的超时**: 避免过长的延迟影响系统
4. **监控告警**: 配置关键指标的告警规则
5. **定期清理**: 定期清理过期的规则和日志

## 许可证

MIT License

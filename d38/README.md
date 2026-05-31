# Solidity智能合约漏洞扫描API

一个基于Go语言开发的无头API服务，使用Slither进行智能合约静态分析和漏洞扫描。支持**历史版本比对**功能，自动高亮显示新增的潜在风险点。

## 功能特性

- 🛡️ **漏洞扫描**: 集成Slither静态分析工具，检测多种智能合约漏洞
- 📊 **结构化报告**: 生成包含漏洞等级、位置、修复建议的JSON报告
- 🔄 **版本比对**: 对比新旧两个版本合约，自动识别新增/移除/未变的风险点
- 📝 **代码差异高亮**: 行级代码比对，清晰显示代码变更
- 🔐 **JWT鉴权**: 基于JWT的身份认证中间件
- ⏱️ **超时保护**: 扫描超时保护，防止复杂合约死循环
- ⚡ **API限流**: 基于令牌桶算法的请求限流
- 📁 **两种扫描方式**: 支持文件上传和直接提交代码两种方式
- 🌐 **CORS支持**: 内置跨域资源共享支持

## 技术栈

- **Go 1.21+**
- **Gin Web Framework**
- **golang-jwt/v4**
- **golang.org/x/time/rate**
- **Slither** (Python静态分析工具)

## 安装依赖

### 1. 安装Go依赖

```bash
go mod tidy
```

### 2. 安装Slither

Slither需要Python 3.8+环境：

```bash
pip3 install slither-analyzer
```

或者使用solc-select管理Solidity编译器版本：

```bash
pip3 install solc-select
solc-select install 0.8.20
solc-select use 0.8.20
```

## 环境配置

复制 `.env.example` 为 `.env` 并修改配置：

```env
PORT=8080
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRATION=3600
RATE_LIMIT=10
RATE_BURST=20
UPLOAD_DIR=./uploads
SLITHER_PATH=slither
MAX_UPLOAD_SIZE=10485760
SCAN_TIMEOUT=120
```

配置说明：
- `SCAN_TIMEOUT`: 单个合约扫描超时时间（秒），默认120秒

## 运行服务

### 开发模式

```bash
go run cmd/main.go
```

### 生产模式

```bash
GIN_MODE=release go run cmd/main.go
```

### 编译运行

```bash
go build -o scanner-api cmd/main.go
./scanner-api
```

## API文档

### 基础URL

```
http://localhost:8080/api/v1
```

### 1. 健康检查 (公开)

```bash
GET /health
```

响应：
```json
{
  "status": "ok",
  "timestamp": "2024-05-20T12:34:56Z",
  "version": "1.0.0"
}
```

### 2. 登录获取Token (公开)

```bash
POST /login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin123"
}
```

响应：
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expires": "2024-05-20T13:34:56Z"
}
```

### 3. 上传合约文件扫描

```bash
POST /scan/upload
Authorization: Bearer <your-token>
Content-Type: multipart/form-data

contract=@MyContract.sol
```

响应：
```json
{
  "success": true,
  "message": "Scan completed",
  "data": {
    "contract_name": "MyContract.sol",
    "scanner": "slither",
    "version": "1.0.0",
    "scan_time": "2024-05-20T12:34:56Z",
    "duration": "2.345s",
    "status": "success",
    "code_hash": "abcdef123456...",
    "vulnerabilities": [
      {
        "id": "VULN-0001",
        "type": "reentrancy-eth",
        "check": "reentrancy-eth",
        "severity": "high",
        "description": "Reentrancy vulnerability detected...",
        "impact": "High",
        "confidence": "High",
        "location": {
          "file": "MyContract.sol",
          "contract": "MyContract",
          "function": "withdraw",
          "line_start": 42,
          "line_end": 48
        },
        "fix_suggestion": "Use Checks-Effects-Interactions pattern...",
        "hash": "unique-hash-for-diffing"
      }
    ],
    "summary": {
      "total": 5,
      "critical": 1,
      "high": 2,
      "medium": 1,
      "low": 1,
      "info": 0
    }
  }
}
```

### 4. 使用代码内容扫描

```bash
POST /scan/code
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "code": "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\n\ncontract Vulnerable {\n    mapping(address => uint256) public balances;\n\n    function deposit() public payable {\n        balances[msg.sender] += msg.value;\n    }\n\n    function withdraw() public {\n        uint256 balance = balances[msg.sender];\n        require(balance > 0);\n        (bool success, ) = msg.sender.call{value: balance}(\"\");\n        require(success);\n        balances[msg.sender] = 0;\n    }\n}",
  "filename": "Vulnerable.sol"
}
```

### 5. 上传两个合约文件进行版本比对

```bash
POST /compare/upload
Authorization: Bearer <your-token>
Content-Type: multipart/form-data

old_contract=@OldVersion.sol
new_contract=@NewVersion.sol
```

响应：
```json
{
  "success": true,
  "message": "Comparison completed",
  "data": {
    "compare_time": "2024-05-20T12:34:56Z",
    "old_version": {
      "file_name": "OldVersion.sol",
      "code_hash": "abcdef123456...",
      "scan_time": "2024-05-20T12:34:54Z",
      "summary": {
        "total": 3,
        "critical": 0,
        "high": 1,
        "medium": 1,
        "low": 1,
        "info": 0
      }
    },
    "new_version": {
      "file_name": "NewVersion.sol",
      "code_hash": "xyz789012345...",
      "scan_time": "2024-05-20T12:34:55Z",
      "summary": {
        "total": 4,
        "critical": 1,
        "high": 1,
        "medium": 1,
        "low": 1,
        "info": 0
      }
    },
    "diff_summary": {
      "total_new": 2,
      "total_removed": 1,
      "total_unchanged": 2,
      "critical_new": 1,
      "high_new": 1,
      "medium_new": 0,
      "critical_removed": 0,
      "high_removed": 0
    },
    "new_risks": [
      {
        "id": "VULN-0001",
        "type": "unchecked-low-level",
        "severity": "high",
        "description": "...",
        "location": {...},
        "fix_suggestion": "..."
      }
    ],
    "removed_risks": [...],
    "unchanged_risks": [...],
    "code_diff": [
      {
        "line_number": 1,
        "content": "// SPDX-License-Identifier: MIT",
        "status": "unchanged"
      },
      {
        "line_number": 2,
        "content": "pragma solidity ^0.8.0;",
        "status": "unchanged"
      },
      {
        "line_number": 15,
        "content": "        balances[msg.sender] = 0;",
        "status": "removed"
      },
      {
        "line_number": 16,
        "content": "        (bool success, ) = msg.sender.call{value: balance}(\"\");",
        "status": "added"
      },
      {
        "line_number": 17,
        "content": "        require(success);",
        "status": "added"
      },
      {
        "line_number": 18,
        "content": "        balances[msg.sender] = 0;",
        "status": "added"
      }
    ],
    "status": "success",
    "message": "Comparison completed successfully"
  }
}
```

### 6. 使用代码内容进行版本比对

```bash
POST /compare/code
Authorization: Bearer <your-token>
Content-Type: application/json

{
  "old_code": "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\n\ncontract Old {\n    function withdraw() public {\n        payable(msg.sender).transfer(address(this).balance);\n    }\n}",
  "new_code": "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\n\ncontract New {\n    function withdraw() public {\n        (bool success, ) = msg.sender.call{value: address(this).balance}(\"\");\n        require(success);\n    }\n}",
  "old_filename": "Old.sol",
  "new_filename": "New.sol"
}
```

## 漏洞检测覆盖

支持检测的主要漏洞类型：

| 漏洞类型 | 严重级别 | 描述 |
|---------|---------|------|
| 重入攻击 (Reentrancy) | Critical/High | 合约外部调用可能被恶意利用 |
| 未检查的低级调用 | High | call/delegatecall返回值未检查 |
| 自毁漏洞 | High | 任何人可销毁合约 |
| 以太币锁定 | High | 无提款功能导致资金永久锁定 |
| 任意发送 | Medium | 可向任意地址发送以太币 |
| tx.origin认证 | Medium | 使用tx.origin进行身份认证 |
| 时间戳依赖 | Medium | 使用block.timestamp作关键逻辑 |
| 弱随机性 | Medium | 不安全的随机数生成 |
| 零地址检查缺失 | Low | 参数缺少零地址验证 |
| 先除后乘 | Low | 精度损失风险 |

## 漏洞严重级别说明

- **Critical**: 必须立即修复，可能导致资金被盗
- **High**: 高风险，建议立即修复
- **Medium**: 中等风险，建议修复
- **Low**: 低风险，建议关注
- **Info**: 信息性提示，代码优化建议

## 版本比对功能详解

### 比对原理

1. **漏洞指纹**: 每个漏洞都会生成一个唯一的hash指纹，基于漏洞类型、描述和影响级别
2. **集合比对**: 将新旧版本的漏洞集合进行比对，识别新增、移除、未变的风险
3. **代码差异**: 基于LCS（最长公共子序列）算法进行行级代码比对

### 高亮显示新增风险

返回结果中：
- `new_risks`: 新版本新增的风险点（重点关注！）
- `removed_risks`: 已修复的风险点
- `unchanged_risks`: 两个版本都存在的风险
- `code_diff`: 代码行级变更，status字段值为 `"added"`, `"removed"`, `"unchanged"`

### 使用场景

1. **代码审查**: PR/MR时自动检测引入的新风险
2. **版本迭代**: 合约升级时验证修复效果
3. **审计跟踪**: 记录漏洞修复的历史轨迹

## 项目结构

```
.
├── cmd/
│   └── main.go              # 主入口文件
├── internal/
│   ├── api/
│   │   ├── auth.go          # JWT认证模块
│   │   ├── handler.go       # API请求处理器
│   │   └── ratelimit.go     # 限流中间件
│   ├── config/
│   │   └── config.go        # 配置管理
│   └── scanner/
│       └── slither.go       # Slither扫描器、结果解析、版本比对
├── pkg/
├── uploads/                  # 临时上传目录
├── .env.example              # 环境变量示例
├── go.mod
├── go.sum
└── README.md
```

## 测试

### 使用curl测试

```bash
# 1. 登录获取token
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r .token)

# 2. 使用代码扫描
curl -X POST http://localhost:8080/api/v1/scan/code \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\n\ncontract Test { function test() public {} }",
    "filename": "Test.sol"
  }'

# 3. 使用文件扫描
curl -X POST http://localhost:8080/api/v1/scan/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "contract=@path/to/your/contract.sol"

# 4. 版本比对（代码方式）
curl -X POST http://localhost:8080/api/v1/compare/code \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "old_code": "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\n\ncontract Old {}",
    "new_code": "// SPDX-License-Identifier: MIT\npragma solidity ^0.8.0;\n\ncontract New { function withdraw() public { payable(msg.sender).transfer(1 ether); } }"
  }'
```

## 安全建议

1. **生产环境**
   - 修改默认JWT_SECRET为强随机密钥
   - 修改默认账号密码或对接用户数据库
   - 启用HTTPS
   - 配置防火墙规则
   - 设置合理的限流参数和扫描超时时间

2. **依赖安全**
   - 定期更新Go依赖包
   - 保持Slither版本最新
   - 定期更新Solidity编译器

## 许可证

MIT License

# TLS Handshake Analyzer

一个Python CLI工具，用于从PCAP文件中提取TLS握手元数据（SNI、证书颁发者、加密套件），并通过免费的IP地理数据库将服务器IP映射到城市/国家。

## 功能特性

- **TLS元数据提取**: 提取Server Name Indication (SNI)、加密套件、证书颁发者等信息
- **IP地理定位**: 自动下载并使用MaxMind GeoLite2-City数据库进行IP地理定位
- **多线程处理**: 支持多线程并行处理多个PCAP文件，提高处理速度
- **多格式输出**: 支持文本、JSON和CSV格式的报告输出
- **进度显示**: 使用tqdm显示处理进度条

## 项目结构

```
d27/
├── main.py              # CLI主入口
├── pcap_parser.py       # PCAP文件解析器
├── tls_extractor.py     # TLS握手数据提取器
├── ip_mapper.py         # IP地理定位映射器
├── report_generator.py  # 报告生成器
├── requirements.txt     # 依赖包列表
└── README.md           # 使用说明
```

## 安装依赖

```bash
pip install -r requirements.txt
```

## 使用方法

### 基本用法

```bash
python main.py capture.pcap
```

### 指定输出文件和格式

```bash
# 输出为JSON格式
python main.py capture.pcap -o result.json -f json

# 输出为CSV格式
python main.py capture.pcap -o result.csv -f csv
```

### 多文件处理（支持通配符）

```bash
# 处理多个PCAP文件
python main.py capture1.pcap capture2.pcap

# 使用通配符处理所有pcap文件
python main.py *.pcap
```

### 多线程处理

```bash
# 使用8个线程处理
python main.py *.pcap -t 8
```

### 跳过IP地理定位

```bash
python main.py capture.pcap --no-geo
```

### 使用自定义GeoIP数据库

```bash
python main.py capture.pcap --geo-db /path/to/GeoLite2-City.mmdb
```

### 详细日志模式

```bash
python main.py capture.pcap -v
```

## 完整参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `pcap_files` | PCAP文件路径（支持多个和通配符） | 必填 |
| `-o, --output` | 输出文件路径 | 标准输出 |
| `-f, --format` | 输出格式：text/json/csv | text |
| `-t, --threads` | 并行处理线程数 | 4 |
| `--no-geo` | 跳过IP地理定位 | False |
| `--geo-db` | 自定义GeoIP数据库路径 | 自动下载 |
| `-v, --verbose` | 启用详细日志 | False |

## 输出示例

### 文本格式输出

```
====================================================================================================
TLS HANDSHAKE ANALYSIS REPORT
====================================================================================================
Total Handshakes: 3
Report Generated: 2024-01-15T10:30:00.000000

--- Handshake #1 ---
Timestamp: 2024-01-15T10:00:00.000000
Server IP: 142.250.185.14
Client IP: 192.168.1.100
Server Name (SNI): www.google.com
Location: Mountain View, United States (US)
Latitude/Longitude: 37.4192, -122.0574
Timezone: America/Los_Angeles
Cipher Suite: TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
Certificate Issuer: C=US, O=Google Trust Services LLC, CN=GTS CA 1C3
Certificate Subject: www.google.com
```

### JSON格式输出

```json
{
  "metadata": {
    "generated_at": "2024-01-15T10:30:00.000000",
    "total_handshakes": 3
  },
  "handshakes": [
    {
      "timestamp": 1705312800.0,
      "datetime": "2024-01-15T10:00:00",
      "server_ip": "142.250.185.14",
      "client_ip": "192.168.1.100",
      "sni": "www.google.com",
      "cert_issuer": "C=US, O=Google Trust Services LLC, CN=GTS CA 1C3",
      "cert_subject": "www.google.com",
      "cipher_suite": "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
      "country": "United States",
      "country_code": "US",
      "city": "Mountain View",
      "latitude": 37.4192,
      "longitude": -122.0574,
      "timezone": "America/Los_Angeles"
    }
  ]
}
```

## 模块说明

### PcapParser (pcap_parser.py)
- 解析PCAP文件，提取TCP端口443的数据包
- 提取源IP、目标IP、端口、负载和时间戳

### TLSExtractor (tls_extractor.py)
- 解析TLS记录，提取Client Hello、Server Hello和Certificate消息
- 从Client Hello中提取SNI
- 从Server Hello中提取加密套件
- 从Certificate消息中解析X.509证书，提取颁发者信息

### GeoIPMapper (ip_mapper.py)
- 自动下载MaxMind GeoLite2-City数据库
- 提供单个IP和批量IP的地理定位查询
- 返回国家、城市、经纬度和时区信息

### ReportGenerator (report_generator.py)
- 将TLS握手数据和地理信息整合
- 支持text、JSON和CSV三种输出格式
- 提供统计摘要信息

## 注意事项

1. 首次运行时会自动下载GeoLite2-City.mmdb数据库（约70MB），请确保网络连接正常
2. 处理大PCAP文件可能需要较长时间，建议使用多线程模式
3. TLS 1.3的证书加密后无法提取，仅能提取TLS 1.2及之前版本的证书信息

## 许可证

本项目仅供学习和研究使用。GeoLite2数据库由MaxMind提供，遵循其使用条款。

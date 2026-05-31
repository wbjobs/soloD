# 金融数据实时处理平台

基于 Spring Boot + Apache Flink + Kafka + Angular 构建的高性能金融数据实时流处理平台。

## 🏗️ 系统架构

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│   Spring Boot       │    │    Apache Kafka     │    │   Apache Flink      │
│   数据模拟器        │───▶│   tick-data Topic   │───▶│   实时聚合计算      │
│   (100ms间隔)       │    │   alerts Topic      │    │   (1分钟 VWAP)      │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
                                                             │
                                                             ▼
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│   Angular 前端      │    │  Spring Boot后端    │    │ aggregated-data     │
│   D3.js K线图       │◀───│  WebSocket服务      │◀───│   Kafka Topic       │
│   实时警报面板      │    │                     │    │                     │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
```

## ✨ 核心功能

### 后端功能
1. **实时Tick数据模拟** - 每100ms生成5只股票(AAPL, GOOGL, MSFT, AMZN, BABA)的Tick数据
2. **Kafka消息队列** - 数据传输与缓冲
3. **Flink实时流处理** - 1分钟滚动窗口VWAP(成交量加权平均价)计算
4. **WebSocket实时推送** - 向前端推送实时数据和警报

### 前端功能
1. **实时Tick数据展示** - 股票价格与成交量实时更新
2. **动态K线图** - 基于D3.js的交互式K线图，支持鼠标悬停详情
3. **异常波动警报** - 价格波动超过3%时自动触发警报
4. **系统概览仪表盘** - 数据统计可视化

## 🛠️ 技术栈

### 后端
- **Spring Boot 3.2.0** - 应用框架
- **Apache Flink 1.18.0** - 实时流处理引擎
- **Apache Kafka** - 消息中间件
- **WebSocket (STOMP)** - 实时通信
- **Java 17**

### 前端
- **Angular 17** - Web框架
- **D3.js 7.8.5** - 数据可视化
- **SockJS + STOMP** - WebSocket客户端
- **TypeScript**

## 🚀 快速开始

### 前置要求
- JDK 17+
- Node.js 18+
- Maven 3.8+
- Docker & Docker Compose

### 步骤1: 启动基础设施

```bash
cd docker
docker-compose up -d
```

服务访问地址:
- Kafka UI: http://localhost:8081
- Flink Dashboard: http://localhost:8082

### 步骤2: 启动Spring Boot后端

```bash
cd backend
mvn spring-boot:run
```

后端服务: http://localhost:8080

### 步骤3: 启动Flink作业

```bash
cd flink-service
mvn clean package
```

然后通过Flink UI提交jar包，或使用CLI:

```bash
flink run -c com.finance.FlinkJob target/flink-service-1.0.0.jar
```

### 步骤4: 启动Angular前端

```bash
cd frontend
npm install
npm start
```

前端访问: http://localhost:4200

## 📁 项目结构

```
d36/
├── backend/                    # Spring Boot后端
│   ├── src/main/java/com/finance/
│   │   ├── model/             # 数据模型
│   │   ├── service/           # 业务服务
│   │   ├── config/            # 配置类
│   │   └── controller/        # REST控制器
│   └── pom.xml
├── flink-service/             # Flink流处理服务
│   ├── src/main/java/com/finance/
│   │   ├── model/             # 数据模型
│   │   └── FlinkJob.java      # Flink作业主类
│   └── pom.xml
├── frontend/                  # Angular前端
│   ├── src/app/
│   │   ├── models/            # TypeScript接口
│   │   ├── services/          # Angular服务
│   │   └── candlestick-chart/ # K线图组件
│   └── package.json
└── docker/                    # Docker Compose配置
    └── docker-compose.yml
```

## 📊 Kafka Topic 说明

| Topic名称 | 数据类型 | 说明 |
|-----------|----------|------|
| `tick-data` | TickData | 原始股票Tick数据 |
| `aggregated-data` | AggregatedData | Flink聚合后的K线数据 |
| `alerts` | Alert | 异常波动警报 |

## 🔧 Flink作业说明

Flink作业实现了以下功能:
1. 从Kafka消费Tick数据
2. 按股票代码(keyBy)分组
3. 1分钟滚动窗口(TumblingEventTimeWindows)
4. 窗口内聚合计算:
   - 开盘价(Open)
   - 最高价(High)
   - 最低价(Low)
   - 收盘价(Close)
   - 成交量加权平均价(VWAP)
   - 总成交量(Volume)
5. 聚合结果写回Kafka

## 🎯 VWAP (成交量加权平均价) 计算公式

```
VWAP = Σ(价格 × 成交量) / Σ(成交量)
```

VWAP是衡量交易执行质量的重要指标，反映了真实的市场成交均价。

## 🎨 前端界面预览

- **实时股票数据面板** - 显示5只股票的最新价格和成交量
- **K线图组件** - 基于D3.js的交互式K线图，支持鼠标悬停查看详细数据
- **异常波动警报** - 红色警示框显示异常波动信息
- **系统概览** - 数据统计可视化

## 🔍 监控与调试

1. **Kafka UI** (localhost:8081) - 查看Topic消息、消费组状态
2. **Flink Dashboard** (localhost:8082) - 查看作业状态、Checkpoint、背压情况
3. **应用日志** - 各服务独立日志输出

## ⚡ 性能优化建议

1. **Kafka** - 增加分区数提高并行度
2. **Flink** - 增加TaskManager数量和Slot数
3. **Checkpoint** - 合理设置Checkpoint间隔(建议30s)
4. **Watermark** - 调整乱序容忍时间

## 📝 开发说明

### 添加新的股票代码

修改 `backend/src/main/resources/application.yml`:
```yaml
simulation:
  stocks: AAPL,GOOGL,MSFT,AMZN,BABA,NEWSTOCK
```

### 修改Tick生成间隔

```yaml
simulation:
  tick-interval-ms: 50  # 改为50ms间隔
```

### 修改异常波动阈值

在 `KafkaConsumerService.java` 中修改:
```java
if (changePercent.abs().compareTo(BigDecimal.valueOf(3)) > 0)
```

## 🤝 贡献指南

欢迎提交Issue和Pull Request!

## 📄 许可证

MIT License

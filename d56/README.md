# Apache Flink Hybrid State Backend

结合 RocksDB 本地状态存储和远程 Redis 集群缓存的自定义 Flink State Backend 实现。专为高吞吐场景设计，提供完善的容错机制和预测预热功能。

## 核心特性

### 1. 两级缓存架构
- **热数据层 (Redis)**: 存储最近访问过的 key，提供高速读写性能
- **冷数据层 (RocksDB)**: 持久化存储所有数据，提供大容量支持

### 2. TTL 自动续期机制
- 每个 key 的状态包含访问时间和 TTL 信息
- 访问热数据时自动刷新 TTL，保持数据热度
- 过期数据自动从 Redis 淘汰，但保留在 RocksDB 中

### 3. 智能读写策略
- **读策略**: 先查 Redis，Miss 则查 RocksDB 并回填 Redis
- **写策略**: 同步写 RocksDB，异步批量写 Redis（使用缓冲队列）

### 4. 背压机制
- **高水位触发**: 当写队列达到高水位（默认 80%）时触发背压
- **低水位释放**: 队列消费到低水位时自动解除阻塞
- **超时保护**: 阻塞超时自动解除，防止线程永久挂起
- **事件统计**: 记录背压触发次数和总阻塞时间，便于监控调优

### 5. Redis Pipeline 批量写入
- **批量提交**: 每 100 条写入或每 10ms 自动 flush 一次
- **Pipeline 优化**: 使用 Redis Pipeline 减少网络 RTT
- **显著提升**: 高吞吐场景下写入性能提升 5-10 倍

### 6. 降级与故障恢复机制
- **连续失败触发**: Redis 连续失败 3 次自动进入降级模式
- **降级行为**: Redis 写入转本地故障队列，只读 RocksDB
- **健康检查**: 每 5 秒 ping Redis 检查恢复状态
- **自动恢复**: Redis 恢复后自动退出降级模式并重放失败队列

### 7. 本地故障队列
- **持久化失败写入**: Redis 失败的写入暂存本地内存队列
- **队列容量控制**: 可配置最大容量（默认 10000）
- **失败重放**: Redis 恢复后批量重放队列中的失败写入
- **重试计数**: 记录每条失败记录的重试次数

### 8. 周期性访问模式检测与预测预热（新增）
- **访问时间序列**: 记录每个 key 的最近 24 次访问时间
- **简化傅里叶变换**: 检测周期性访问模式（如日报、周报等）
- **周期范围**: 1 小时至 24 小时的周期模式检测
- **置信度评估**: 计算模式稳定性，只对高置信度模式进行预热
- **提前预热**: 在预测的下一次访问前 5 分钟自动从 RocksDB 预热到 Redis
- **定时扫描**: 每分钟扫描周期性数据，自动预热即将访问的数据

### 9. Always Hot 常驻热数据（新增）
- **手动标记**: 支持手动标记某些 key 为常驻热数据
- **自动续期**: 自动刷新这些 key 的 TTL，永远保存在 Redis 中
- **定时刷新**: 每 10 分钟检查刷新一次常驻热数据
- **管理接口**: 支持标记、取消标记、查询所有常驻热数据

### 10. 管理与监控接口（新增）
- **冷热分布统计**: 查询当前冷热数据分布、各分类统计
- **Key 详情查询**: 查询单个 key 的访问统计、周期模式、预热状态
- **预热统计**: 查询总预热次数、预测预热次数、常驻热数据数量
- **缓存统计**: Redis 命中率、背压事件、降级次数等完整统计
- **Redis 驱逐**: 手动驱逐单个或全部 Redis 缓存

### 11. Checkpoint 支持
- 持久化 RocksDB 的 SST 文件到 HDFS
- 序列化上传 Redis 中的热数据快照
- 实现 CheckpointedFunction 接口，支持 Flink 原生故障恢复

### 12. 动态冷热数据调整
- 支持配置热数据占比阈值
- 自动调整冷热数据分界线
- 基于缓存命中率的自动调优机制

## 项目结构

```
hybrid-rocksdb-redis-statebackend/
├── src/
│   ├── main/
│   │   ├── java/com/flink/statebackend/
│   │   │   ├── config/
│   │   │   │   └── HybridStateBackendConfig.java    # 配置类
│   │   │   ├── model/
│   │   │   │   ├── StateValue.java                  # 状态值包装类
│   │   │   │   ├── CacheStatistics.java             # 缓存统计信息
│   │   │   │   └── CheckpointSnapshot.java          # Checkpoint 快照
│   │   │   ├── store/
│   │   │   │   ├── RocksDBStoreManager.java         # RocksDB 管理器
│   │   │   │   ├── RedisCacheManager.java           # Redis 管理器（含异步批量写入）
│   │   │   │   └── HDFSCheckpointManager.java       # HDFS Checkpoint 管理器
│   │   │   ├── util/
│   │   │   │   └── StateSerializer.java             # 序列化工具
│   │   │   ├── HybridStateBackend.java              # 核心后端实现
│   │   │   └── HybridStateBackendFunction.java      # 抽象函数类（实现 CheckpointedFunction）
│   │   └── example/
│   │       └── HybridStateBackendExample.java       # 示例应用
│   └── test/
│       └── java/com/flink/statebackend/
│           └── HybridStateBackendTest.java          # 单元测试
└── pom.xml
```

## 核心组件说明

### HybridStateBackendConfig
配置类，包含以下可配置项：
- RocksDB 本地路径
- Redis 连接信息（主机、端口、密码、数据库）
- 热数据 TTL、占比阈值
- Redis 批量写入参数（批量大小、间隔时间）
- HDFS Checkpoint 路径
- 自动调优参数

### StateValue
状态值包装类，包含：
- 实际值的字节数组
- 最后访问时间戳
- TTL（毫秒）
- 访问计数器

### RocksDBStoreManager
RocksDB 存储管理器，提供：
- 基础 CRUD 操作
- 批量写入
- 前缀扫描
- 过期数据清理
- 快照创建

### RedisCacheManager
Redis 缓存管理器，提供：
- 同步/异步写入
- 批量写入
- TTL 刷新
- 热数据全量获取
- 异步写入队列（使用 Jedis Pipeline）

### HybridStateBackend
核心后端实现，协调：
- 两级缓存读写策略
- TTL 自动续期
- 缓存统计收集
- 自动调优机制
- 后台维护任务

### HybridStateBackendFunction
抽象函数类，实现：
- CheckpointedFunction 接口
- 状态初始化与恢复
- Checkpoint 快照创建
- 与 Flink 运行时集成

## 使用示例

### 基本配置
```java
HybridStateBackendConfig config = new HybridStateBackendConfig();

// RocksDB 配置
config.setRocksDbPath("/tmp/flink/rocksdb");

// Redis 配置
config.setRedisHost("localhost");
config.setRedisPort(6379);
config.setRedisDatabase(0);

// 热数据配置
config.setHotDataTTL(Duration.ofMinutes(5));
config.setHotDataRatioThreshold(0.3);
config.setRedisBatchSize(100);
config.setRedisBatchInterval(Duration.ofMillis(100));

// HDFS 配置
config.setHdfsCheckpointPath("hdfs://namenode:9000/flink/checkpoints");
config.setHdfsSnapshotPath("hdfs://namenode:9000/flink/snapshots");

// 自动调优配置
config.setEnableAutoTuning(true);
config.setTargetCacheHitRate(0.85);
config.setTuningInterval(Duration.ofMinutes(1));
```

### 自定义算子实现
```java
public class MyStatefulFunction
        extends HybridStateBackendFunction<String, Tuple2<String, Long>>
        implements MapFunction<String, Tuple2<String, Long>> {

    public MyStatefulFunction(HybridStateBackendConfig config) {
        super(config);
    }

    @Override
    public Tuple2<String, Long> map(String input) throws Exception {
        String[] parts = input.split(",");
        String key = parts[0];

        // 读取状态（先 Redis，后 RocksDB）
        StateValue stateValue = getState(key);
        long count = 1;

        if (stateValue != null) {
            count = Long.parseLong(new String(stateValue.getValue())) + 1;
        }

        // 写入状态（同步 RocksDB，异步 Redis）
        putState(key, String.valueOf(count).getBytes());

        return Tuple2.of(key, count);
    }
}
```

### Flink 作业集成
```java
StreamExecutionEnvironment env = StreamExecutionEnvironment.getExecutionEnvironment();

// 启用 Checkpoint
env.enableCheckpointing(5000);
env.getCheckpointConfig().setCheckpointTimeout(60000);

// 创建数据流
DataStream<String> input = env.socketTextStream("localhost", 9999);

// 使用自定义 State Backend
DataStream<Tuple2<String, Long>> processed = input
        .map(new MyStatefulFunction(config))
        .setParallelism(2);

processed.print();
env.execute("Hybrid State Backend Job");
```

## 部署要求

### 环境依赖
- Java 11+
- Apache Flink 1.17+
- Redis 5.0+（集群或单机）
- Hadoop HDFS 3.x（用于 Checkpoint）
- RocksDB 7.9+

### 编译打包
```bash
# 编译
mvn clean compile

# 打包（包含依赖）
mvn package

# 跳过测试
mvn package -DskipTests
```

### 运行测试
```bash
# 需要本地 Redis 运行在 localhost:6379
mvn test
```

## 性能优化建议

### 1. Redis 配置
- 使用 Redis Cluster 获得更好的扩展性
- 配置合理的 maxmemory-policy（推荐 volatile-lru）
- 启用 Redis Pipeline 批量操作

### 2. RocksDB 配置
- 调整 write_buffer_size 和 max_write_buffer_number
- 配置合理的压缩算法（LZ4 推荐）
- 使用 SSD 存储获得更好的 I/O 性能

### 3. 批量参数调优
- `redisBatchSize`: 根据吞吐量调整，建议 50-200
- `redisBatchInterval`: 根据延迟要求调整，建议 50-200ms

### 4. 热数据比例
- 根据业务访问模式调整 hotDataRatioThreshold
- 启用自动调优（enableAutoTuning=true）让系统动态优化

## 监控指标

系统内置以下监控指标：
- Redis 缓存命中率
- 总访问次数（Redis/RocksDB）
- 写入次数
- 热/冷数据 key 数量
- Checkpoint 大小和耗时

可以通过 `stateBackend.getStatistics()` 获取统计信息。

## 故障场景与恢复机制

### 1. Flink 任务故障
- **检测**: Flink JobManager 自动检测 TaskManager 故障
- **恢复**: 自动触发最近的 Checkpoint 恢复完整状态
- **状态一致性**: Exactly-Once 语义保障

### 2. Redis 集群故障（新增）
- **检测**: 连续 3 次写入失败自动检测
- **降级**: 自动进入降级模式
  - Redis 写入转本地故障队列（内存）
  - Redis 读取直接命中失败，降级为读 RocksDB
- **恢复检测**: 后台线程每 5 秒 ping Redis
- **自动恢复**: Redis 恢复后
  - 退出降级模式
  - 批量重放故障队列中的写入
  - 恢复正常的 Redis 读写

### 3. 写入背压（新增）
- **触发**: 写队列达到高水位（默认 80%）
- **行为**: 上游写入线程阻塞，保护内存不溢出
- **恢复**: 队列消费到低水位时自动解除阻塞
- **保护**: 5 秒超时机制，防止永久阻塞

### 4. RocksDB 故障
- **恢复**: 从 HDFS Checkpoint 恢复完整状态文件

## 高吞吐场景最佳实践

### 1. 配置调优
```java
// 高吞吐场景推荐配置
config.setWriteBufferCapacity(50000);           // 更大的缓冲区
config.setBackPressureHighWaterMark(40000);      // 80% 高水位
config.setBackPressureLowWaterMark(10000);       // 20% 低水位
config.setPipelineBatchSize(200);                // 更大的 Pipeline 批量
config.setRedisPipelineFlushInterval(Duration.ofMillis(5));  // 更频繁的 flush
```

### 2. 监控告警
建议监控以下指标并设置告警阈值：
- `backPressureEvents > 100/分钟`: 消费能力不足，需要增加 Redis 资源
- `isDegraded() == true`: 系统已降级，需立即排查 Redis
- `failureQueueSize > 10000`: 故障队列积压，可能内存风险
- `redisWriteFailures > 50/分钟`: Redis 异常率过高

### 3. 内存预估
- 写缓冲区内存: `writeBufferCapacity * 平均 entry 大小`
- 故障队列内存: `failureQueueCapacity * 平均 entry 大小`
- 建议预留 2GB 以上堆外内存给 RocksDB

## 管理接口使用（新增）

### 1. Always Hot 常驻热数据管理
```java
StateBackendManager manager = stateBackend.getManager();

// 标记 key 为常驻热数据
manager.markAsAlwaysHot("report:daily:user:123");

// 取消标记
manager.unmarkAsAlwaysHot("report:daily:user:123");

// 查询是否为常驻热数据
boolean isHot = manager.isAlwaysHot("report:daily:user:123");

// 获取所有常驻热数据
Set<String> alwaysHotKeys = manager.getAllAlwaysHotKeys();
```

### 2. 手动触发预热
```java
StateBackendManager manager = stateBackend.getManager();

// 预热单个 key
manager.triggerWarmUp("report:daily:user:123");

// 批量预热多个 key
Set<String> keysToWarmUp = new HashSet<>();
keysToWarmUp.add("report:daily:user:123");
keysToWarmUp.add("report:daily:user:456");
manager.triggerBatchWarmUp(keysToWarmUp);
```

### 3. 查询冷热分布统计
```java
StateBackendManager manager = stateBackend.getManager();
HotColdDistribution distribution = manager.getHotColdDistribution();

System.out.println("总 key 数: " + distribution.getTotalKeys());
System.out.println("热数据 key 数: " + distribution.getHotKeys());
System.out.println("冷数据 key 数: " + distribution.getColdKeys());
System.out.println("常驻热数据 key 数: " + distribution.getAlwaysHotKeys());
System.out.println("周期性模式 key 数: " + distribution.getPeriodicPatternKeys());
System.out.println("平均访问次数: " + distribution.getAvgAccessCount());

// 查看 Top 20 热数据
for (HotColdDistribution.KeyInfo info : distribution.getTopHotKeys()) {
    System.out.println(info.getKey() + ": " + info.getAccessCount() + " 次访问");
}
```

### 4. 查询单个 key 详情
```java
StateBackendManager manager = stateBackend.getManager();
String keyInfo = manager.getKeyInfo("report:daily:user:123");
System.out.println(keyInfo);
```

### 5. 获取完整统计信息
```java
StateBackendManager manager = stateBackend.getManager();

// 缓存统计
Map<String, Object> cacheStats = manager.getCacheStatistics();
System.out.println("Redis 命中率: " + cacheStats.get("cacheHitRate"));
System.out.println("背压事件次数: " + cacheStats.get("backPressureEvents"));
System.out.println("是否降级: " + cacheStats.get("isDegraded"));

// 预热统计
Map<String, Object> warmUpStats = manager.getWarmUpStatistics();
System.out.println("总预热次数: " + warmUpStats.get("totalWarmUps"));
System.out.println("预测预热次数: " + warmUpStats.get("predictiveWarmUps"));
System.out.println("常驻热数据预热次数: " + warmUpStats.get("alwaysHotWarmUps"));
```

### 6. 手动驱逐 Redis 缓存
```java
StateBackendManager manager = stateBackend.getManager();

// 驱逐单个 key
manager.evictFromRedis("report:daily:user:123");

// 驱逐所有 key（慎用）
manager.evictAllFromRedis();
```

## 周期性访问模式检测原理

### 检测流程
1. **数据收集**: 记录每个 key 的最近 24 次访问时间戳
2. **间隔计算**: 计算相邻访问时间的间隔序列
3. **傅里叶变换**: 对间隔序列应用简化的离散傅里叶变换
4. **频谱分析**: 寻找频谱中的主导频率
5. **周期验证**: 计算变异系数验证周期稳定性（< 0.3 视为稳定）
6. **预热决策**: 对高置信度周期模式，在预测访问前 5 分钟预热

### 支持的周期范围
- 最小周期: 1 小时
- 最大周期: 24 小时
- 支持日报、小时报表、班报表等常见周期性业务场景

## 注意事项

1. Redis 缓存容量有限，需要配置合理的 TTL 和内存限制
2. Checkpoint 期间会有一定的性能影响，建议合理配置间隔
3. 大状态下建议增加 RocksDB 的内存配额
4. 生产环境建议使用 Redis Cluster 避免单点故障
5. **高吞吐场景务必启用背压和降级机制**（默认已启用）
6. 故障队列是内存队列，长时间降级可能导致内存占用上升
7. 预测预热功能会消耗一定 CPU 资源用于傅里叶变换计算，可根据业务需求决定是否启用

## License

Apache License 2.0

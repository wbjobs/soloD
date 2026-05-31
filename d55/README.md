# TimescaleDB - Time-Series Database Engine

高性能时序数据库，基于LSM-Tree存储引擎，支持自适应索引和向量化查询。

## 特性

### 存储引擎
- **LSM-Tree 架构**: MemTable + SSTable + WAL
- **高吞吐写入**: 支持每秒10万+点写入
- **WAL日志**: 保证数据持久性

### 索引系统
- **倒排索引**: 按measurement+tagset唯一标识时间序列
- **自适应组合索引**: 高频查询自动构建布隆过滤器+跳表索引
- **TTL冷热分离**: 7天以上数据自动迁移到SSTable只读区

### 查询引擎
- **向量化执行**: SIMD指令加速聚合计算
- **支持聚合函数**: mean/max/min/sum/count
- **时间区间剪枝**: 利用时间范围快速跳过无关数据块
- **多维GROUP BY**: 支持按tag和时间分组

### API兼容
- **HTTP API**: 标准REST接口
- **InfluxDB兼容**: 支持InfluxDB line protocol写入和InfluxQL查询

## 目录结构

```
.
├── include/
│   ├── core/              # 核心数据结构
│   ├── storage/           # 存储引擎
│   ├── index/             # 索引模块
│   ├── query/             # 查询引擎
│   └── api/               # API层
├── src/                   # 源文件
├── tests/                 # 单元测试
├── benchmarks/            # 性能基准测试
└── CMakeLists.txt
```

## 编译

```bash
mkdir build
cd build
cmake ..
make -j
```

## 运行

### 启动服务器

```bash
./timescale_db [port] [data_dir]
```

默认端口: 8086

### API接口

#### 写入数据 (InfluxDB line protocol)

```bash
curl -X POST http://localhost:8086/write --data-binary '
cpu,host=server1,region=us-west value=42.5 1620000000000000000
cpu,host=server2,region=us-west value=45.2 1620000001000000000
'
```

#### 查询数据 (InfluxQL)

```bash
curl -G "http://localhost:8086/query" --data-urlencode 'q=SELECT mean(value) FROM cpu WHERE time > now() - 1h GROUP BY time(10m)'
```

#### 健康检查

```bash
curl http://localhost:8086/health
```

### 运行测试

```bash
make test
```

### 运行性能基准测试

```bash
./benchmarks/write_benchmark
```

## 核心组件说明

### 1. MemTable (内存表)
- 基于有序映射存储
- 达到容量阈值后自动flush到SSTable
- 支持时间范围快速查询

### 2. SSTable (排序字符串表)
- 按时间分区存储
- 块级索引支持快速定位
- 压缩存储减少磁盘占用

### 3. 倒排索引
- measurement和tag组合映射到series ID
- 支持多tag条件快速过滤
- 线程安全的并发访问

### 4. 自适应索引管理器
- 统计查询模式，识别高频tag组合
- 自动构建布隆过滤器加速存在性检查
- 跳表索引支持快速范围查询
- LRU策略淘汰冷门索引

### 5. TTL管理器
- 后台线程监控数据时间
- 超过7天的数据自动标记为冷数据
- 冷数据迁移到只读SSTable

### 6. 向量化执行器
- AVX2/SSE指令集加速
- 批量处理减少函数调用开销
- 支持多种聚合函数的SIMD优化

### 7. 查询日志收集器
- 记录所有查询模式和执行性能
- 识别慢查询(>100ms)进行重点分析
- 统计高频tag组合和聚合模式

### 8. 索引分析器
- 基于查询频率和性能数据生成推荐
- 预估索引创建后的性能提升百分比
- 预估索引存储空间占用
- 预估索引构建时间

### 9. 索引管理器
- 后台周期性分析任务(默认每10分钟)
- 管理员可通过API批准/拒绝推荐
- 后台异步构建索引，不阻塞读写
- 索引使用统计，长期未用索引自动清理(默认7天)

## 性能目标

- 写入吞吐量: ≥ 100,000 points/sec
- 查询延迟: < 100ms (热数据范围查询)
- 内存占用: < 2GB (100万序列)

## 依赖

- C++20 兼容编译器 (GCC 10+, Clang 12+, MSVC 2022+)
- CMake 3.20+
- OpenSSL

## License

MIT License

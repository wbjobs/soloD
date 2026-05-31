# HNSW PostgreSQL Extension (PQ-HNSW)

这是一个基于HNSW（Hierarchical Navigable Small World）算法的PostgreSQL向量相似度搜索索引扩展，支持Product Quantization（PQ）乘积量化压缩。

## 功能特性

### 核心功能
- **支持向量类型**: float32数组，维度最大2048
- **相似度度量**: L2欧氏距离和余弦距离
- **索引结构**: 多层图结构，顶层稀疏，下层密集
- **操作支持**: INSERT、DELETE、VACUUM
- **删除机制**: 标记删除 + 后台异步物理删除
- **并行构建**: 支持多线程并行索引构建
- **SIMD优化**: AVX2和AVX512向量化加速距离计算
- **查询语法**: 支持 `ORDER BY embedding <-> '[0.1,0.2,...]' LIMIT 10`

### PQ量化压缩 (新增)
- **乘积量化**: 将向量切分为M个子空间，每个子空间使用K个质心量化
- **8倍压缩比**: 从8KB/向量压缩到1KB/向量（M=16时）
- **ADC加速**: Asymmetric Distance Computation异步距离计算
- **残差修正**: 使用向量残差修正量化误差
- **自动重训练**: 数据变化超过20%时自动触发codebook重训练
- **混合模式**: 热门数据保留全精度，冷数据使用压缩版本
- **热度阈值**: 可配置访问次数阈值，超过自动升级为全精度

## 安装方法

### 依赖要求
- PostgreSQL 12+ 开发头文件
- GCC 支持AVX2/AVX512
- pthread库

### 编译安装
```bash
make
make install
```

### 在数据库中创建扩展
```sql
CREATE EXTENSION hnsw;
```

## 使用示例

### 1. 创建表
```sql
CREATE TABLE items (
    id SERIAL PRIMARY KEY,
    embedding float4[]  -- 128维向量
);
```

### 2. 创建HNSW索引
```sql
-- 使用L2距离（默认）
CREATE INDEX ON items USING hnsw (embedding) WITH (M=16, ef_construction=64);

-- 使用余弦距离
CREATE INDEX ON items USING hnsw (embedding hnsw_cosine_ops) WITH (M=16, ef_construction=64);
```

### 3. 插入数据
```sql
INSERT INTO items (embedding) VALUES
    ('{0.1, 0.2, 0.3, ...}'::float4[]),
    ('{0.4, 0.5, 0.6, ...}'::float4[]);
```

### 4. KNN相似度搜索
```sql
-- 查找与查询向量最相似的10个条目（L2距离）
SELECT id, embedding <-> '{0.1, 0.2, ...}'::float4[] AS distance
FROM items
ORDER BY embedding <-> '{0.1, 0.2, ...}'::float4[]
LIMIT 10;

-- 余弦距离搜索
SELECT id, embedding <=> '{0.1, 0.2, ...}'::float4[] AS distance
FROM items
ORDER BY embedding <=> '{0.1, 0.2, ...}'::float4[]
LIMIT 10;
```

### 5. 删除和VACUUM
```sql
-- 删除条目（软删除）
DELETE FROM items WHERE id = 1;

-- 执行VACUUM进行物理清理
VACUUM ANALYZE items;
```

## 索引参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| M | 16 | 每个节点的最大邻居数，控制图的连通性 |
| ef_construction | 64 | 构建时的候选集大小，影响构建速度和索引质量 |
| ef_search | 32 | 搜索时的候选集大小，影响搜索速度和召回率 |
| dimensions | 128 | 向量维度 |

## 性能调优建议

1. **M参数**: 通常在12-48之间，高维向量使用较大值
2. **ef_construction**: 值越大索引质量越好，但构建越慢
3. **ef_search**: 查询时可动态调整，值越大召回率越高但越慢
4. **内存**: 确保有足够内存容纳索引，建议shared_buffers足够大

## 支持的操作符

| 操作符 | 说明 |
|--------|------|
| `<->` | L2欧氏距离 |
| `<=>` | 余弦距离 |

## 文件结构

```
hnsw/
├── hnsw.control              # 扩展控制文件
├── hnsw--1.0.sql             # SQL定义文件
├── Makefile                   # 编译配置
├── hnsw.h                     # 头文件和数据结构定义
├── hnsw.c                     # 索引访问方法主入口
├── hnsw_distance.c            # 距离计算函数
├── hnsw_insert.c              # 节点插入算法
├── hnsw_search.c              # KNN搜索算法
├── hnsw_delete.c              # 删除操作
├── hnsw_vacuum.c              # VACUUM操作
├── hnsw_build.c               # 索引构建（含批量插入、并行）
├── hnsw_utils.c               # 工具函数
├── hnsw_slab.c                # Slab分配器（内存优化）
└── README.md                  # 本文件
```

## 内存优化方案

### 问题背景
在构建百万级向量索引时，原实现频繁创建和销毁小对象导致PG的MemoryContext严重碎片化，最终引发后端进程崩溃。

### 解决方案

**1. Slab分配器 (hnsw_slab.c)**
- 使用专用MemoryContext管理大内存块
- 预分配固定大小的对象池（每个block 64MB）
- 避免频繁palloc/pfree，减少内存碎片
- 支持内存使用量追踪

**2. 批量插入模式**
- 每10000个向量为一批进行插入
- 批量处理减少锁竞争和内存分配开销
- 每批完成后刷新内存状态

**3. 内存阈值检查**
- 每插入1000个向量检查一次内存使用
- 达到work_mem的80%时自动触发临时合并
- 清理已删除节点释放空间

**4. 调试支持**
- DEBUG1级别日志输出内存使用情况
- 日志包含：节点内存、向量内存、总内存、内存限制
- 构建进度每10万向量报告一次

### 构建日志示例
```
LOG:  [HNSW] Starting index build with work_mem = 65536 KB
LOG:  [HNSW] Sort complete, starting insertion: 1000000 tuples
LOG:  [HNSW] Index build progress: 100000 vectors inserted
LOG:  [HNSW] Index build progress: 200000 vectors inserted
LOG:  [HNSW] Index build complete: 1000000 vectors in 100 batches
```

### 查询正确性保证
- 索引构建算法保持不变，仅改变内存分配方式
- KNN搜索逻辑完全保留
- 距离计算（含SIMD优化）不受影响
- 所有现有查询语法继续有效

## 技术实现细节

### HNSW算法
- **多层图结构**: 每层都是一个连通图，顶层节点最少，逐层向下密度增加
- **贪婪搜索**: 从顶层入口点开始，逐层向下搜索
- **邻居选择**: 构建时为每个节点选择M个最近邻居

### SIMD优化
- **AVX2**: 一次处理8个float32元素
- **AVX512**: 一次处理16个float32元素
- **自动回退**: 不支持的CPU自动降级到标量计算

### PQ乘积量化 (新增)
- **子空间划分**: 将D维向量均匀划分为M个D/M维子空间
- **K-means聚类**: 对每个子空间独立运行K-means，生成K个质心
- **向量编码**: 每个子空间用最接近的质心ID（1字节）表示
- **ADC计算**: 查询向量与质心预计算距离表，查表快速得到距离
- **残差修正**: 记录量化残差用于修正距离计算误差

### 混合索引模式 (新增)
- **热度追踪**: 记录每个向量的访问次数
- **智能升级**: 访问超过阈值的向量自动从压缩升级到全精度
- **内存平衡**: 热门向量保持高精度，冷门向量节省内存

### Codebook自动重训练
- **变化监测**: 记录插入/删除次数占总数据比例
- **阈值触发**: 变化超过20%自动触发codebook重训练
- **渐进更新**: 重训练期间继续服务查询，完成后无缝切换

### 并发安全
- 使用pthread mutex保护索引操作
- 支持并行构建，多线程同时插入

## 注意事项

1. 本实现是概念验证版本，生产环境使用前请充分测试
2. 目前索引仅保存在内存中，重启后需要重建
3. 持久化存储需要额外实现页式存储管理
4. 建议在PostgreSQL 14+版本上使用

## 许可证

PostgreSQL License

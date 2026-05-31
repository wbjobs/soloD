#pragma once

#include "common/common.h"
#include <vector>
#include <cstring>
#include <numeric>
#include <algorithm>

namespace timescale::query {

struct TimeSeriesBatch {
    std::vector<Timestamp> timestamps;
    std::vector<std::vector<double>> values;
    size_t batch_size;
    size_t field_count;
    
    TimeSeriesBatch(size_t batch_size = 1024, size_t field_count = 1)
        : batch_size(batch_size), field_count(field_count) {
        timestamps.reserve(batch_size);
        values.resize(field_count);
        for (auto& v : values) {
            v.reserve(batch_size);
        }
    }
    
    void add(Timestamp ts, const std::vector<double>& vals) {
        timestamps.push_back(ts);
        for (size_t i = 0; i < field_count && i < vals.size(); ++i) {
            values[i].push_back(vals[i]);
        }
    }
    
    void clear() {
        timestamps.clear();
        for (auto& v : values) {
            v.clear();
        }
    }
    
    size_t size() const { return timestamps.size(); }
    bool empty() const { return timestamps.empty(); }
};

class VectorizedAggregator {
public:
    enum class AggFunc {
        SUM,
        COUNT,
        MEAN,
        MIN,
        MAX
    };
    
    VectorizedAggregator(AggFunc func);
    ~VectorizedAggregator() = default;
    
    void accumulate(const TimeSeriesBatch& batch, size_t field_idx = 0);
    double result() const;
    void reset();
    
    static VectorizedAggregator sum() { return VectorizedAggregator(AggFunc::SUM); }
    static VectorizedAggregator count() { return VectorizedAggregator(AggFunc::COUNT); }
    static VectorizedAggregator mean() { return VectorizedAggregator(AggFunc::MEAN); }
    static VectorizedAggregator min() { return VectorizedAggregator(AggFunc::MIN); }
    static VectorizedAggregator max() { return VectorizedAggregator(AggFunc::MAX); }

private:
    void accumulate_sum(const std::vector<double>& values);
    void accumulate_count(const std::vector<double>& values);
    void accumulate_mean(const std::vector<double>& values);
    void accumulate_min(const std::vector<double>& values);
    void accumulate_max(const std::vector<double>& values);
    
    void accumulate_simd_sum(const std::vector<double>& values);
    void accumulate_simd_min(const std::vector<double>& values);
    void accumulate_simd_max(const std::vector<double>& values);
    
    AggFunc func_;
    double sum_ = 0.0;
    size_t count_ = 0;
    double min_ = std::numeric_limits<double>::max();
    double max_ = std::numeric_limits<double>::lowest();
};

class TimeRangePruner {
public:
    TimeRangePruner(Timestamp start, Timestamp end);
    ~TimeRangePruner() = default;
    
    bool should_skip(Timestamp block_min, Timestamp block_max) const;
    bool in_range(Timestamp ts) const;
    
    void prune_batch(const TimeSeriesBatch& input, TimeSeriesBatch& output) const;
    
    Timestamp start() const { return start_; }
    Timestamp end() const { return end_; }

private:
    Timestamp start_;
    Timestamp end_;
};

class GroupByExecutor {
public:
    struct GroupKey {
        std::map<std::string, std::string> tags;
        Timestamp time_bucket;
        
        bool operator==(const GroupKey& other) const {
            return tags == other.tags && time_bucket == other.time_bucket;
        }
    };
    
    struct GroupKeyHash {
        size_t operator()(const GroupKey& key) const {
            size_t hash = std::hash<Timestamp>{}(key.time_bucket);
            for (const auto& [k, v] : key.tags) {
                hash ^= std::hash<std::string>{}(k) + 0x9e3779b9 + (hash << 6) + (hash >> 2);
                hash ^= std::hash<std::string>{}(v) + 0x9e3779b9 + (hash << 6) + (hash >> 2);
            }
            return hash;
        }
    };
    
    GroupByExecutor(const std::vector<std::string>& group_tags,
                     Timestamp time_bucket_interval,
                     VectorizedAggregator::AggFunc agg_func);
    ~GroupByExecutor() = default;
    
    void execute(const TimeSeriesBatch& batch, 
                 const std::vector<TagMap>& batch_tags,
                 size_t field_idx = 0);
    
    std::vector<std::pair<GroupKey, double>> get_results() const;
    void reset();

private:
    std::vector<std::string> group_tags_;
    Timestamp time_bucket_interval_;
    VectorizedAggregator::AggFunc agg_func_;
    
    std::unordered_map<GroupKey, VectorizedAggregator, GroupKeyHash> groups_;
};

}

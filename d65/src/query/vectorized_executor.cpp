#include "query/vectorized_executor.h"

#ifdef _MSC_VER
#include <intrin.h>
#else
#include <x86intrin.h>
#endif

namespace timescale::query {

VectorizedAggregator::VectorizedAggregator(AggFunc func) : func_(func) {}

void VectorizedAggregator::accumulate(const TimeSeriesBatch& batch, size_t field_idx) {
    if (batch.empty() || field_idx >= batch.values.size()) {
        return;
    }
    
    const auto& values = batch.values[field_idx];
    
    switch (func_) {
        case AggFunc::SUM:
            accumulate_sum(values);
            break;
        case AggFunc::COUNT:
            accumulate_count(values);
            break;
        case AggFunc::MEAN:
            accumulate_mean(values);
            break;
        case AggFunc::MIN:
            accumulate_min(values);
            break;
        case AggFunc::MAX:
            accumulate_max(values);
            break;
    }
}

double VectorizedAggregator::result() const {
    switch (func_) {
        case AggFunc::SUM:
            return sum_;
        case AggFunc::COUNT:
            return static_cast<double>(count_);
        case AggFunc::MEAN:
            return count_ > 0 ? sum_ / count_ : 0.0;
        case AggFunc::MIN:
            return min_;
        case AggFunc::MAX:
            return max_;
        default:
            return 0.0;
    }
}

void VectorizedAggregator::reset() {
    sum_ = 0.0;
    count_ = 0;
    min_ = std::numeric_limits<double>::max();
    max_ = std::numeric_limits<double>::lowest();
}

void VectorizedAggregator::accumulate_sum(const std::vector<double>& values) {
    if (values.size() >= 4) {
        accumulate_simd_sum(values);
    }
    
    for (size_t i = (values.size() / 4) * 4; i < values.size(); ++i) {
        sum_ += values[i];
    }
    count_ += values.size();
}

void VectorizedAggregator::accumulate_count(const std::vector<double>& values) {
    count_ += values.size();
}

void VectorizedAggregator::accumulate_mean(const std::vector<double>& values) {
    accumulate_sum(values);
}

void VectorizedAggregator::accumulate_min(const std::vector<double>& values) {
    if (values.empty()) return;
    
    if (values.size() >= 4) {
        accumulate_simd_min(values);
    }
    
    for (size_t i = (values.size() / 4) * 4; i < values.size(); ++i) {
        if (values[i] < min_) {
            min_ = values[i];
        }
    }
    count_ += values.size();
}

void VectorizedAggregator::accumulate_max(const std::vector<double>& values) {
    if (values.empty()) return;
    
    if (values.size() >= 4) {
        accumulate_simd_max(values);
    }
    
    for (size_t i = (values.size() / 4) * 4; i < values.size(); ++i) {
        if (values[i] > max_) {
            max_ = values[i];
        }
    }
    count_ += values.size();
}

void VectorizedAggregator::accumulate_simd_sum(const std::vector<double>& values) {
#ifdef ENABLE_SIMD
    size_t n = values.size();
    size_t i = 0;
    
    __m256d sum_vec = _mm256_setzero_pd();
    
    for (; i + 4 <= n; i += 4) {
        __m256d val_vec = _mm256_loadu_pd(&values[i]);
        sum_vec = _mm256_add_pd(sum_vec, val_vec);
    }
    
    double result[4];
    _mm256_storeu_pd(result, sum_vec);
    sum_ += result[0] + result[1] + result[2] + result[3];
#else
    for (size_t i = 0; i < values.size(); ++i) {
        sum_ += values[i];
    }
#endif
}

void VectorizedAggregator::accumulate_simd_min(const std::vector<double>& values) {
#ifdef ENABLE_SIMD
    size_t n = values.size();
    size_t i = 0;
    
    __m256d min_vec = _mm256_set1_pd(min_);
    
    for (; i + 4 <= n; i += 4) {
        __m256d val_vec = _mm256_loadu_pd(&values[i]);
        min_vec = _mm256_min_pd(min_vec, val_vec);
    }
    
    double result[4];
    _mm256_storeu_pd(result, min_vec);
    min_ = std::min({min_, result[0], result[1], result[2], result[3]});
#else
    for (size_t i = 0; i < values.size(); ++i) {
        if (values[i] < min_) min_ = values[i];
    }
#endif
}

void VectorizedAggregator::accumulate_simd_max(const std::vector<double>& values) {
#ifdef ENABLE_SIMD
    size_t n = values.size();
    size_t i = 0;
    
    __m256d max_vec = _mm256_set1_pd(max_);
    
    for (; i + 4 <= n; i += 4) {
        __m256d val_vec = _mm256_loadu_pd(&values[i]);
        max_vec = _mm256_max_pd(max_vec, val_vec);
    }
    
    double result[4];
    _mm256_storeu_pd(result, max_vec);
    max_ = std::max({max_, result[0], result[1], result[2], result[3]});
#else
    for (size_t i = 0; i < values.size(); ++i) {
        if (values[i] > max_) max_ = values[i];
    }
#endif
}

TimeRangePruner::TimeRangePruner(Timestamp start, Timestamp end)
    : start_(start), end_(end) {}

bool TimeRangePruner::should_skip(Timestamp block_min, Timestamp block_max) const {
    return block_max < start_ || block_min > end_;
}

bool TimeRangePruner::in_range(Timestamp ts) const {
    return ts >= start_ && ts <= end_;
}

void TimeRangePruner::prune_batch(const TimeSeriesBatch& input, TimeSeriesBatch& output) const {
    output.clear();
    
    for (size_t i = 0; i < input.size(); ++i) {
        if (in_range(input.timestamps[i])) {
            std::vector<double> vals;
            for (size_t f = 0; f < input.values.size(); ++f) {
                vals.push_back(input.values[f][i]);
            }
            output.add(input.timestamps[i], vals);
        }
    }
}

GroupByExecutor::GroupByExecutor(const std::vector<std::string>& group_tags,
                                   Timestamp time_bucket_interval,
                                   VectorizedAggregator::AggFunc agg_func)
    : group_tags_(group_tags), 
      time_bucket_interval_(time_bucket_interval),
      agg_func_(agg_func) {}

void GroupByExecutor::execute(const TimeSeriesBatch& batch,
                                const std::vector<TagMap>& batch_tags,
                                size_t field_idx) {
    if (batch.empty()) return;
    
    for (size_t i = 0; i < batch.size(); ++i) {
        GroupKey key;
        
        if (i < batch_tags.size()) {
            for (const auto& tag : group_tags_) {
                auto it = batch_tags[i].find(tag);
                if (it != batch_tags[i].end()) {
                    key.tags[tag] = it->second;
                }
            }
        }
        
        key.time_bucket = (batch.timestamps[i] / time_bucket_interval_) * time_bucket_interval_;
        
        auto it = groups_.find(key);
        if (it == groups_.end()) {
            it = groups_.emplace(key, VectorizedAggregator(agg_func_)).first;
        }
        
        TimeSeriesBatch single_batch(1, batch.field_count);
        std::vector<double> vals;
        for (size_t f = 0; f < batch.values.size(); ++f) {
            vals.push_back(batch.values[f][i]);
        }
        single_batch.add(batch.timestamps[i], vals);
        it->second.accumulate(single_batch, field_idx);
    }
}

std::vector<std::pair<GroupByExecutor::GroupKey, double>> GroupByExecutor::get_results() const {
    std::vector<std::pair<GroupKey, double>> results;
    for (const auto& [key, agg] : groups_) {
        results.emplace_back(key, agg.result());
    }
    return results;
}

void GroupByExecutor::reset() {
    groups_.clear();
}

}

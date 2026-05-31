#pragma once

#include "core/common.h"
#include "query/vector_executor.h"
#include "storage/memtable.h"
#include "storage/sstable.h"
#include "index/inverted_index.h"
#include "index/ttl_manager.h"
#include <vector>
#include <map>
#include <unordered_map>
#include <memory>
#include <shared_mutex>
#include <algorithm>
#include <cmath>

namespace timescale {

struct GroupKey {
    std::map<std::string, TagValue> tags;
    Timestamp time_bucket;

    bool operator<(const GroupKey& other) const {
        if (time_bucket != other.time_bucket) {
            return time_bucket < other.time_bucket;
        }
        return tags < other.tags;
    }
};

struct AggregationResult {
    double sum;
    double min;
    double max;
    size_t count;

    AggregationResult() : sum(0), min(INFINITY), max(-INFINITY), count(0) {}

    void add(double value) {
        sum += value;
        min = std::min(min, value);
        max = std::max(max, value);
        count++;
    }

    double get(AggregationType type) const {
        switch (type) {
            case AggregationType::SUM: return sum;
            case AggregationType::MIN: return min;
            case AggregationType::MAX: return max;
            case AggregationType::COUNT: return static_cast<double>(count);
            case AggregationType::MEAN: return count > 0 ? sum / count : 0.0;
        }
        return 0.0;
    }
};

class QueryEngine {
public:
    QueryEngine(std::shared_ptr<InvertedIndex> inverted_index,
                std::shared_ptr<MemTable> memtable,
                std::shared_ptr<TTLManager> ttl_manager,
                const std::string& data_dir)
        : inverted_index_(inverted_index),
          memtable_(memtable),
          ttl_manager_(ttl_manager),
          data_dir_(data_dir) {}

    QueryResult execute(const Query& query) {
        QueryResult result;

        Timestamp normalized_start = query.start_time;
        Timestamp normalized_end = query.end_time;

        if (query.group_by_time > 0) {
            normalized_start = (query.start_time / query.group_by_time) * query.group_by_time;
            if (query.end_time % query.group_by_time != 0) {
                normalized_end = ((query.end_time / query.group_by_time) + 1) * query.group_by_time;
            }
        }

        std::vector<SeriesID> series_ids = inverted_index_->find_series(
            query.measurement, query.tags);

        for (SeriesID sid : series_ids) {
            Series series = inverted_index_->get_series(sid);

            auto values = get_values_for_series(sid, normalized_start, normalized_end);

            if (query.group_by.empty() && query.group_by_time == 0) {
                std::vector<double> field_values;
                for (const auto& [ts, vs] : values) {
                    if (!vs.empty()) {
                        field_values.push_back(vs[0]);
                    }
                }

                std::vector<std::pair<Timestamp, FieldValue>> agg_results;
                for (const auto& agg : query.aggregations) {
                    double r = aggregate(field_values, agg.type);
                    agg_results.emplace_back(0, r);
                }

                result.series.push_back(series.tags);
                result.data.push_back(agg_results);
            } else {
                std::map<GroupKey, AggregationResult> groups;

                for (const auto& [ts, vs] : values) {
                    if (vs.empty()) continue;

                    GroupKey key;

                    if (query.group_by_time > 0) {
                        key.time_bucket = (ts / query.group_by_time) * query.group_by_time;
                    }

                    for (const auto& tag_name : query.group_by) {
                        auto it = series.tags.find(tag_name);
                        if (it != series.tags.end()) {
                            key.tags[tag_name] = it->second;
                        }
                    }

                    groups[key].add(vs[0]);
                }

                for (const auto& [key, agg_result] : groups) {
                    std::map<std::string, TagValue> combined_tags = series.tags;
                    for (const auto& [k, v] : key.tags) {
                        combined_tags[k] = v;
                    }

                    std::vector<std::pair<Timestamp, FieldValue>> agg_values;
                    for (const auto& agg : query.aggregations) {
                        agg_values.emplace_back(key.time_bucket, agg_result.get(agg.type));
                    }

                    result.series.push_back(combined_tags);
                    result.data.push_back(agg_values);
                }
            }
        }

        return result;
    }

    std::vector<std::pair<Timestamp, std::vector<FieldValue>>> get_values_for_series(
        SeriesID series_id, Timestamp start, Timestamp end) {

        std::vector<std::pair<Timestamp, std::vector<FieldValue>>> result;

        auto mem_values = memtable_->get_range(series_id, start, end);
        result.insert(result.end(), mem_values.begin(), mem_values.end());

        auto sstable_paths = ttl_manager_->get_sstables_for_query(series_id, start, end);
        for (const auto& path : sstable_paths) {
            if (path == "hot") continue;

            SSTable sstable(path);
            auto sstable_values = sstable.read_range(series_id, start, end);
            result.insert(result.end(), sstable_values.begin(), sstable_values.end());
        }

        std::sort(result.begin(), result.end(),
                  [](const auto& a, const auto& b) { return a.first < b.first; });

        return result;
    }

private:
    double aggregate(const std::vector<double>& values, AggregationType type) {
        double result;
        switch (type) {
            case AggregationType::SUM:
                VectorAggregator::sum_simd(values, result);
                break;
            case AggregationType::MIN:
                VectorAggregator::min_simd(values, result);
                break;
            case AggregationType::MAX:
                VectorAggregator::max_simd(values, result);
                break;
            case AggregationType::COUNT: {
                size_t count;
                VectorAggregator::count_simd(values, count);
                result = static_cast<double>(count);
                break;
            }
            case AggregationType::MEAN:
                VectorAggregator::mean_simd(values, result);
                break;
        }
        return result;
    }

    std::shared_ptr<InvertedIndex> inverted_index_;
    std::shared_ptr<MemTable> memtable_;
    std::shared_ptr<TTLManager> ttl_manager_;
    std::string data_dir_;
    mutable std::shared_mutex mutex_;
};

}

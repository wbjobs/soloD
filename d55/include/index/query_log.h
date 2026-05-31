#pragma once

#include "core/common.h"
#include <vector>
#include <deque>
#include <map>
#include <unordered_map>
#include <shared_mutex>
#include <chrono>
#include <atomic>
#include <algorithm>

namespace timescale {

enum class QueryType {
    RANGE_QUERY,
    AGGREGATION_QUERY,
    GROUP_BY_QUERY,
    OTHER
};

struct QueryLogEntry {
    std::string query_id;
    std::string measurement;
    std::vector<std::string> filter_tags;
    std::vector<std::string> group_by_tags;
    std::vector<std::string> aggregate_fields;
    Timestamp start_time;
    Timestamp end_time;
    Timestamp execution_start;
    Timestamp execution_end;
    int64_t execution_time_ns;
    size_t scanned_points;
    size_t returned_points;
    bool is_slow_query;

    std::string get_pattern_key() const {
        std::string key = measurement;
        for (const auto& tag : filter_tags) {
            key += "|F:" + tag;
        }
        for (const auto& tag : group_by_tags) {
            key += "|G:" + tag;
        }
        std::sort(key.begin(), key.end());
        return key;
    }

    QueryType get_type() const {
        if (!group_by_tags.empty() || !aggregate_fields.empty()) {
            return QueryType::GROUP_BY_QUERY;
        }
        if (!filter_tags.empty()) {
            return QueryType::AGGREGATION_QUERY;
        }
        return QueryType::RANGE_QUERY;
    }
};

class QueryLogger {
public:
    QueryLogger(size_t max_log_entries = 10000, int64_t slow_query_threshold_ms = 100)
        : max_log_entries_(max_log_entries),
          slow_query_threshold_ns_(slow_query_threshold_ms * 1000000LL),
          total_queries_(0),
          slow_queries_(0) {}

    void log_query(const QueryLogEntry& entry) {
        std::unique_lock lock(mutex_);
        
        total_queries_++;
        if (entry.execution_time_ns >= slow_query_threshold_ns_) {
            slow_queries_++;
        }

        query_log_.push_back(entry);
        
        if (query_log_.size() > max_log_entries_) {
            query_log_.pop_front();
        }

        std::string pattern_key = entry.get_pattern_key();
        pattern_stats_[pattern_key].count++;
        pattern_stats_[pattern_key].total_time_ns += entry.execution_time_ns;
        pattern_stats_[pattern_key].max_time_ns = std::max(
            pattern_stats_[pattern_key].max_time_ns, entry.execution_time_ns);
        pattern_stats_[pattern_key].last_seen = std::max(
            pattern_stats_[pattern_key].last_seen, entry.execution_start);
    }

    std::vector<QueryLogEntry> get_slow_queries(int64_t min_time_ms = 0) const {
        std::shared_lock lock(mutex_);
        std::vector<QueryLogEntry> result;
        int64_t threshold = min_time_ms > 0 ? min_time_ms * 1000000LL : slow_query_threshold_ns_;
        
        for (const auto& entry : query_log_) {
            if (entry.execution_time_ns >= threshold) {
                result.push_back(entry);
            }
        }
        return result;
    }

    std::vector<QueryLogEntry> get_recent_queries(size_t count = 100) const {
        std::shared_lock lock(mutex_);
        std::vector<QueryLogEntry> result;
        
        auto it = query_log_.end();
        size_t n = std::min(count, query_log_.size());
        for (size_t i = 0; i < n; ++i) {
            --it;
            result.push_back(*it);
        }
        std::reverse(result.begin(), result.end());
        return result;
    }

    struct PatternStats {
        size_t count = 0;
        int64_t total_time_ns = 0;
        int64_t max_time_ns = 0;
        Timestamp last_seen = 0;

        double avg_time_ms() const {
            return count > 0 ? (total_time_ns / 1000000.0) / count : 0;
        }
    };

    std::map<std::string, PatternStats> get_pattern_stats() const {
        std::shared_lock lock(mutex_);
        return pattern_stats_;
    }

    size_t total_queries() const { return total_queries_.load(); }
    size_t slow_queries() const { return slow_queries_.load(); }

    void clear() {
        std::unique_lock lock(mutex_);
        query_log_.clear();
        pattern_stats_.clear();
        total_queries_ = 0;
        slow_queries_ = 0;
    }

private:
    size_t max_log_entries_;
    int64_t slow_query_threshold_ns_;
    
    mutable std::shared_mutex mutex_;
    std::deque<QueryLogEntry> query_log_;
    std::map<std::string, PatternStats> pattern_stats_;
    std::atomic<size_t> total_queries_;
    std::atomic<size_t> slow_queries_;
};

}

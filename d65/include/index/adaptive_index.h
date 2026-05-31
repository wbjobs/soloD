#pragma once

#include "common/common.h"
#include "index/bloom_filter.h"
#include "index/skip_list.h"
#include "index/series_manager.h"
#include <unordered_map>
#include <queue>
#include <mutex>
#include <shared_mutex>
#include <thread>
#include <atomic>

namespace timescale::index {

struct TagQueryPattern {
    std::vector<std::string> tag_keys;
    uint64_t query_count = 0;
    Timestamp last_query_time = 0;
    
    bool operator==(const TagQueryPattern& other) const {
        return tag_keys == other.tag_keys;
    }
};

struct TagQueryPatternHash {
    size_t operator()(const TagQueryPattern& pattern) const {
        size_t hash = 0;
        for (const auto& key : pattern.tag_keys) {
            hash ^= std::hash<std::string>{}(key) + 0x9e3779b9 + (hash << 6) + (hash >> 2);
        }
        return hash;
    }
};

struct CompositeIndex {
    TagQueryPattern pattern;
    BloomFilter bloom_filter;
    TimeSeriesSkipList skip_list;
    uint64_t usage_count = 0;
    Timestamp created_at;
    Timestamp last_used;
    bool is_hot = true;
};

class AdaptiveIndexManager {
public:
    explicit AdaptiveIndexManager(size_t hot_threshold = 100, 
                                   Timestamp ttl_period = 7 * 24 * 3600 * 1000000000LL);
    ~AdaptiveIndexManager();

    void record_query(const std::vector<std::string>& tag_keys);
    
    std::vector<SeriesID> query_with_index(const TagMap& tags,
                                            Timestamp start_time,
                                            Timestamp end_time,
                                            SeriesManager& series_manager);
    
    size_t composite_index_count() const;
    size_t hot_index_count() const;
    size_t cold_index_count() const;
    
    void start_maintenance();
    void stop_maintenance();

private:
    void maintenance_thread_func();
    void check_create_composite_index();
    void migrate_cold_indices();
    void cleanup_expired_indices();
    bool should_create_index(const TagQueryPattern& pattern) const;
    
    size_t hot_threshold_;
    Timestamp ttl_period_;
    
    mutable std::shared_mutex mutex_;
    std::unordered_map<TagQueryPattern, uint64_t, TagQueryPatternHash> query_patterns_;
    std::unordered_map<std::string, std::unique_ptr<CompositeIndex>> composite_indices_;
    
    std::thread maintenance_thread_;
    std::atomic<bool> running_{false};
};

}

#include "index/adaptive_index.h"
#include <algorithm>
#include <sstream>

namespace timescale::index {

AdaptiveIndexManager::AdaptiveIndexManager(size_t hot_threshold, Timestamp ttl_period)
    : hot_threshold_(hot_threshold), ttl_period_(ttl_period) {}

AdaptiveIndexManager::~AdaptiveIndexManager() {
    stop_maintenance();
}

void AdaptiveIndexManager::record_query(const std::vector<std::string>& tag_keys) {
    if (tag_keys.empty()) return;
    
    TagQueryPattern pattern;
    pattern.tag_keys = tag_keys;
    std::sort(pattern.tag_keys.begin(), pattern.tag_keys.end());
    
    std::unique_lock lock(mutex_);
    query_patterns_[pattern]++;
}

bool AdaptiveIndexManager::should_create_index(const TagQueryPattern& pattern) const {
    auto it = query_patterns_.find(pattern);
    if (it == query_patterns_.end()) return false;
    
    return it->second >= hot_threshold_;
}

void AdaptiveIndexManager::check_create_composite_index() {
    std::unique_lock lock(mutex_);
    
    for (const auto& [pattern, count] : query_patterns_) {
        if (count < hot_threshold_) continue;
        
        std::ostringstream key_ss;
        for (size_t i = 0; i < pattern.tag_keys.size(); ++i) {
            if (i > 0) key_ss << "|";
            key_ss << pattern.tag_keys[i];
        }
        std::string index_key = key_ss.str();
        
        if (composite_indices_.find(index_key) != composite_indices_.end()) {
            continue;
        }
        
        auto index = std::make_unique<CompositeIndex>();
        index->pattern = pattern;
        index->created_at = now();
        index->last_used = index->created_at;
        index->is_hot = true;
        
        composite_indices_[index_key] = std::move(index);
    }
}

void AdaptiveIndexManager::migrate_cold_indices() {
    Timestamp current_time = now();
    
    std::unique_lock lock(mutex_);
    
    for (auto& [key, index] : composite_indices_) {
        if (index->is_hot && (current_time - index->last_used) > ttl_period_) {
            index->is_hot = false;
        }
    }
}

void AdaptiveIndexManager::cleanup_expired_indices() {
    Timestamp current_time = now();
    
    std::unique_lock lock(mutex_);
    
    std::vector<std::string> to_remove;
    for (const auto& [key, index] : composite_indices_) {
        if ((current_time - index->last_used) > 2 * ttl_period_) {
            to_remove.push_back(key);
        }
    }
    
    for (const auto& key : to_remove) {
        composite_indices_.erase(key);
    }
}

std::vector<SeriesID> AdaptiveIndexManager::query_with_index(const TagMap& tags,
                                                               Timestamp start_time,
                                                               Timestamp end_time,
                                                               SeriesManager& series_manager) {
    if (tags.empty()) {
        return series_manager.find_series_by_tags({});
    }
    
    std::vector<std::string> tag_keys;
    for (const auto& [k, _] : tags) {
        tag_keys.push_back(k);
    }
    std::sort(tag_keys.begin(), tag_keys.end());
    
    record_query(tag_keys);
    
    {
        std::ostringstream key_ss;
        for (size_t i = 0; i < tag_keys.size(); ++i) {
            if (i > 0) key_ss << "|";
            key_ss << tag_keys[i];
        }
        std::string index_key = key_ss.str();
        
        std::shared_lock lock(mutex_);
        auto it = composite_indices_.find(index_key);
        if (it != composite_indices_.end()) {
            it->second->last_used = now();
            it->second->usage_count++;
        }
    }
    
    return series_manager.find_series_by_tags(tags);
}

size_t AdaptiveIndexManager::composite_index_count() const {
    std::shared_lock lock(mutex_);
    return composite_indices_.size();
}

size_t AdaptiveIndexManager::hot_index_count() const {
    std::shared_lock lock(mutex_);
    size_t count = 0;
    for (const auto& [_, index] : composite_indices_) {
        if (index->is_hot) count++;
    }
    return count;
}

size_t AdaptiveIndexManager::cold_index_count() const {
    std::shared_lock lock(mutex_);
    size_t count = 0;
    for (const auto& [_, index] : composite_indices_) {
        if (!index->is_hot) count++;
    }
    return count;
}

void AdaptiveIndexManager::maintenance_thread_func() {
    while (running_) {
        check_create_composite_index();
        migrate_cold_indices();
        cleanup_expired_indices();
        
        std::this_thread::sleep_for(std::chrono::minutes(5));
    }
}

void AdaptiveIndexManager::start_maintenance() {
    if (!running_) {
        running_ = true;
        maintenance_thread_ = std::thread(&AdaptiveIndexManager::maintenance_thread_func, this);
    }
}

void AdaptiveIndexManager::stop_maintenance() {
    running_ = false;
    if (maintenance_thread_.joinable()) {
        maintenance_thread_.join();
    }
}

}

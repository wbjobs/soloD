#include "index/series_manager.h"
#include <functional>
#include <algorithm>

namespace timescale::index {

SeriesID SeriesManager::generate_id(const std::string& measurement, const TagMap& tags) const {
    std::string key = measurement;
    for (const auto& [k, v] : tags) {
        key += "|" + k + "=" + v;
    }
    return std::hash<std::string>{}(key);
}

SeriesID SeriesManager::get_or_create_series(const std::string& measurement, const TagMap& tags) {
    SeriesID id = generate_id(measurement, tags);
    
    {
        std::shared_lock lock(mutex_);
        if (series_map_.find(id) != series_map_.end()) {
            return id;
        }
    }
    
    {
        std::unique_lock lock(mutex_);
        
        if (series_map_.find(id) == series_map_.end()) {
            SeriesInfo info;
            info.id = id;
            info.measurement = measurement;
            info.tags = tags;
            info.created_at = now();
            info.last_updated = info.created_at;
            
            series_map_[id] = info;
            measurement_index_[measurement].insert(id);
            
            for (const auto& [k, v] : tags) {
                tag_index_[k][v].insert(id);
            }
        }
        
        return id;
    }
}

const SeriesInfo* SeriesManager::get_series(SeriesID id) const {
    std::shared_lock lock(mutex_);
    auto it = series_map_.find(id);
    return it != series_map_.end() ? &it->second : nullptr;
}

std::vector<SeriesID> SeriesManager::find_series(const std::string& measurement,
                                                  const TagMap& tags) const {
    std::shared_lock lock(mutex_);
    
    auto meas_it = measurement_index_.find(measurement);
    if (meas_it == measurement_index_.end()) {
        return {};
    }
    
    std::set<SeriesID> result = meas_it->second;
    
    for (const auto& [k, v] : tags) {
        auto tag_k_it = tag_index_.find(k);
        if (tag_k_it == tag_index_.end()) {
            return {};
        }
        
        auto tag_v_it = tag_k_it->second.find(v);
        if (tag_v_it == tag_k_it->second.end()) {
            return {};
        }
        
        std::set<SeriesID> intersection;
        std::set_intersection(
            result.begin(), result.end(),
            tag_v_it->second.begin(), tag_v_it->second.end(),
            std::inserter(intersection, intersection.begin())
        );
        
        result.swap(intersection);
        
        if (result.empty()) break;
    }
    
    return std::vector<SeriesID>(result.begin(), result.end());
}

std::vector<SeriesID> SeriesManager::find_series_by_tags(const TagMap& tags) const {
    std::shared_lock lock(mutex_);
    
    if (tags.empty()) {
        std::vector<SeriesID> all;
        for (const auto& [id, _] : series_map_) {
            all.push_back(id);
        }
        return all;
    }
    
    std::set<SeriesID> result;
    bool first = true;
    
    for (const auto& [k, v] : tags) {
        auto tag_k_it = tag_index_.find(k);
        if (tag_k_it == tag_index_.end()) {
            return {};
        }
        
        auto tag_v_it = tag_k_it->second.find(v);
        if (tag_v_it == tag_k_it->second.end()) {
            return {};
        }
        
        if (first) {
            result = tag_v_it->second;
            first = false;
        } else {
            std::set<SeriesID> intersection;
            std::set_intersection(
                result.begin(), result.end(),
                tag_v_it->second.begin(), tag_v_it->second.end(),
                std::inserter(intersection, intersection.begin())
            );
            result.swap(intersection);
        }
        
        if (result.empty()) break;
    }
    
    return std::vector<SeriesID>(result.begin(), result.end());
}

size_t SeriesManager::series_count() const {
    std::shared_lock lock(mutex_);
    return series_map_.size();
}

bool SeriesManager::remove_series(SeriesID id) {
    std::unique_lock lock(mutex_);
    
    auto it = series_map_.find(id);
    if (it == series_map_.end()) {
        return false;
    }
    
    const SeriesInfo& info = it->second;
    
    measurement_index_[info.measurement].erase(id);
    if (measurement_index_[info.measurement].empty()) {
        measurement_index_.erase(info.measurement);
    }
    
    for (const auto& [k, v] : info.tags) {
        tag_index_[k][v].erase(id);
        if (tag_index_[k][v].empty()) {
            tag_index_[k].erase(v);
            if (tag_index_[k].empty()) {
                tag_index_.erase(k);
            }
        }
    }
    
    series_map_.erase(it);
    return true;
}

bool SeriesManager::update_series_time(SeriesID id, Timestamp time) {
    std::unique_lock lock(mutex_);
    
    auto it = series_map_.find(id);
    if (it == series_map_.end()) {
        return false;
    }
    
    if (time > it->second.last_updated) {
        it->second.last_updated = time;
    }
    return true;
}

}

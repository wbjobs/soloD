#pragma once

#include "common/common.h"
#include <unordered_map>
#include <shared_mutex>
#include <vector>
#include <set>

namespace timescale::index {

struct SeriesInfo {
    SeriesID id;
    std::string measurement;
    TagMap tags;
    Timestamp created_at;
    Timestamp last_updated;
};

class SeriesManager {
public:
    SeriesManager() = default;
    ~SeriesManager() = default;

    SeriesID get_or_create_series(const std::string& measurement, const TagMap& tags);
    const SeriesInfo* get_series(SeriesID id) const;
    
    std::vector<SeriesID> find_series(const std::string& measurement,
                                       const TagMap& tags = {}) const;
    
    std::vector<SeriesID> find_series_by_tags(const TagMap& tags) const;
    
    size_t series_count() const;
    
    bool remove_series(SeriesID id);
    bool update_series_time(SeriesID id, Timestamp time);

private:
    SeriesID generate_id(const std::string& measurement, const TagMap& tags) const;

    mutable std::shared_mutex mutex_;
    std::unordered_map<SeriesID, SeriesInfo> series_map_;
    std::unordered_map<std::string, std::set<SeriesID>> measurement_index_;
    std::unordered_map<std::string, std::unordered_map<std::string, std::set<SeriesID>>> tag_index_;
};

}

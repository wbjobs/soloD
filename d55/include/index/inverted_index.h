#pragma once

#include "core/common.h"
#include <shared_mutex>
#include <set>

namespace timescale {

class InvertedIndex {
public:
    InvertedIndex() : next_series_id_(1) {}

    SeriesID get_or_create_series(const std::string& measurement,
                                   const std::map<std::string, TagValue>& tags) {
        std::string series_key = build_series_key(measurement, tags);
        {
            std::shared_lock lock(mutex_);
            auto it = series_key_to_id_.find(series_key);
            if (it != series_key_to_id_.end()) {
                return it->second;
            }
        }

        std::unique_lock lock(mutex_);
        auto it = series_key_to_id_.find(series_key);
        if (it != series_key_to_id_.end()) {
            return it->second;
        }

        SeriesID id = next_series_id_++;
        series_key_to_id_[series_key] = id;
        series_id_to_series_[id] = {id, measurement, tags};

        for (const auto& [tag_key, tag_value] : tags) {
            std::string tag_entry = tag_key + "=" + tag_value;
            tag_index_[tag_entry].insert(id);
        }
        measurement_index_[measurement].insert(id);

        return id;
    }

    std::vector<SeriesID> find_series(const std::string& measurement,
                                       const std::map<std::string, TagValue>& tags) {
        std::shared_lock lock(mutex_);

        std::set<SeriesID> result;
        auto meas_it = measurement_index_.find(measurement);
        if (meas_it == measurement_index_.end()) {
            return {};
        }
        result = meas_it->second;

        for (const auto& [tag_key, tag_value] : tags) {
            std::string tag_entry = tag_key + "=" + tag_value;
            auto tag_it = tag_index_.find(tag_entry);
            if (tag_it == tag_index_.end()) {
                return {};
            }

            std::set<SeriesID> intersection;
            std::set_intersection(
                result.begin(), result.end(),
                tag_it->second.begin(), tag_it->second.end(),
                std::inserter(intersection, intersection.begin())
            );
            result.swap(intersection);

            if (result.empty()) break;
        }

        return std::vector<SeriesID>(result.begin(), result.end());
    }

    Series get_series(SeriesID id) const {
        std::shared_lock lock(mutex_);
        auto it = series_id_to_series_.find(id);
        return it != series_id_to_series_.end() ? it->second : Series{};
    }

    size_t series_count() const {
        std::shared_lock lock(mutex_);
        return series_id_to_series_.size();
    }

private:
    std::string build_series_key(const std::string& measurement,
                                 const std::map<std::string, TagValue>& tags) const {
        std::string key = measurement;
        for (const auto& [k, v] : tags) {
            key += "|" + k + "=" + v;
        }
        return key;
    }

    mutable std::shared_mutex mutex_;
    SeriesID next_series_id_;
    std::unordered_map<std::string, SeriesID> series_key_to_id_;
    std::unordered_map<SeriesID, Series> series_id_to_series_;
    std::unordered_map<std::string, std::set<SeriesID>> tag_index_;
    std::unordered_map<std::string, std::set<SeriesID>> measurement_index_;
};

}

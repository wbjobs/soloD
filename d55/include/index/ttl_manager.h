#pragma once

#include "core/common.h"
#include "storage/sstable.h"
#include <shared_mutex>
#include <thread>
#include <atomic>
#include <queue>

namespace timescale {

struct IndexEntry {
    SeriesID series_id;
    Timestamp min_time;
    Timestamp max_time;
    std::string sstable_path;
    bool is_cold;
};

class TTLManager {
public:
    TTLManager(const std::string& data_dir, Timestamp cold_threshold = WEEK)
        : data_dir_(data_dir),
          cold_threshold_(cold_threshold),
          running_(false) {}

    ~TTLManager() {
        stop();
    }

    void start() {
        running_ = true;
        ttl_thread_ = std::thread(&TTLManager::run_ttl_check, this);
    }

    void stop() {
        running_ = false;
        if (ttl_thread_.joinable()) {
            ttl_thread_.join();
        }
    }

    void add_hot_index(SeriesID series_id, Timestamp min_time, Timestamp max_time) {
        std::unique_lock lock(mutex_);
        hot_indexes_[series_id] = {series_id, min_time, max_time, "", false};
    }

    void update_index_time(SeriesID series_id, Timestamp time) {
        std::unique_lock lock(mutex_);

        auto hot_it = hot_indexes_.find(series_id);
        if (hot_it != hot_indexes_.end()) {
            hot_it->second.min_time = std::min(hot_it->second.min_time, time);
            hot_it->second.max_time = std::max(hot_it->second.max_time, time);
            return;
        }

        auto cold_it = cold_indexes_.find(series_id);
        if (cold_it != cold_indexes_.end()) {
            cold_it->second.min_time = std::min(cold_it->second.min_time, time);
            cold_it->second.max_time = std::max(cold_it->second.max_time, time);
        }
    }

    std::vector<std::string> get_sstables_for_query(SeriesID series_id,
                                                     Timestamp start, Timestamp end) {
        std::shared_lock lock(mutex_);
        std::vector<std::string> result;

        auto hot_it = hot_indexes_.find(series_id);
        if (hot_it != hot_indexes_.end() &&
            !(hot_it->second.max_time < start || hot_it->second.min_time >= end)) {
            result.push_back("hot");
        }

        for (const auto& [id, entry] : cold_indexes_) {
            if (id == series_id &&
                !(entry.max_time < start || entry.min_time >= end)) {
                result.push_back(entry.sstable_path);
            }
        }

        return result;
    }

    void migrate_to_cold(SeriesID series_id, const std::string& sstable_path) {
        std::unique_lock lock(mutex_);

        auto it = hot_indexes_.find(series_id);
        if (it != hot_indexes_.end()) {
            IndexEntry cold_entry = it->second;
            cold_entry.sstable_path = sstable_path;
            cold_entry.is_cold = true;
            cold_indexes_[series_id] = cold_entry;
            hot_indexes_.erase(it);
        }
    }

    bool should_migrate_to_cold(SeriesID series_id) const {
        std::shared_lock lock(mutex_);

        auto it = hot_indexes_.find(series_id);
        if (it == hot_indexes_.end()) return false;

        Timestamp now = now_nanos();
        return (now - it->second.max_time) > cold_threshold_;
    }

private:
    void run_ttl_check() {
        while (running_) {
            std::this_thread::sleep_for(std::chrono::hours(1));

            std::vector<SeriesID> to_migrate;
            {
                std::shared_lock lock(mutex_);
                for (const auto& [id, entry] : hot_indexes_) {
                    if ((now_nanos() - entry.max_time) > cold_threshold_) {
                        to_migrate.push_back(id);
                    }
                }
            }
        }
    }

    std::string data_dir_;
    Timestamp cold_threshold_;
    std::atomic<bool> running_;
    std::thread ttl_thread_;
    mutable std::shared_mutex mutex_;
    std::unordered_map<SeriesID, IndexEntry> hot_indexes_;
    std::unordered_map<SeriesID, IndexEntry> cold_indexes_;
};

}

#pragma once

#include "core/common.h"
#include <map>
#include <shared_mutex>

namespace timescale {

struct MemTableEntry {
    SeriesID series_id;
    Timestamp timestamp;
    std::vector<FieldValue> values;
};

class MemTable {
public:
    MemTable() : size_(0), mem_size_(0) {}

    bool insert(SeriesID series_id, Timestamp timestamp, const std::vector<FieldValue>& values) {
        std::unique_lock lock(mutex_);
        size_t entry_size = sizeof(MemTableEntry) + values.size() * sizeof(FieldValue);
        if (mem_size_ + entry_size > MEMTABLE_SIZE) {
            return false;
        }

        auto key = std::make_pair(series_id, timestamp);
        data_[key] = values;
        size_++;
        mem_size_ += entry_size;
        return true;
    }

    std::vector<std::pair<Timestamp, std::vector<FieldValue>>> get_range(
        SeriesID series_id, Timestamp start, Timestamp end) const {
        std::shared_lock lock(mutex_);
        std::vector<std::pair<Timestamp, std::vector<FieldValue>>> result;

        auto start_key = std::make_pair(series_id, start);
        auto end_key = std::make_pair(series_id + 1, 0);

        auto it = data_.lower_bound(start_key);
        while (it != data_.end() && it->first < end_key && it->first.second < end) {
            result.emplace_back(it->first.second, it->second);
            ++it;
        }
        return result;
    }

    size_t size() const {
        std::shared_lock lock(mutex_);
        return size_;
    }

    size_t mem_size() const {
        std::shared_lock lock(mutex_);
        return mem_size_;
    }

    void clear() {
        std::unique_lock lock(mutex_);
        data_.clear();
        size_ = 0;
        mem_size_ = 0;
    }

    const auto& get_data() const { return data_; }

private:
    mutable std::shared_mutex mutex_;
    std::map<std::pair<SeriesID, Timestamp>, std::vector<FieldValue>> data_;
    size_t size_;
    size_t mem_size_;
};

}

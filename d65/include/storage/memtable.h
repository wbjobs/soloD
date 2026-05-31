#pragma once

#include "common/common.h"
#include <map>
#include <shared_mutex>

namespace timescale::storage {

struct MemTableEntry {
    Timestamp timestamp;
    std::unordered_map<std::string, double> fields;
};

class MemTable {
public:
    MemTable() = default;
    ~MemTable() = default;

    bool insert(SeriesID series_id, const Point& point);
    
    size_t size() const;
    size_t entry_count() const;
    
    bool should_flush(size_t threshold) const;
    
    const std::map<SeriesID, std::vector<MemTableEntry>>& data() const;
    
    void clear();

private:
    mutable std::shared_mutex mutex_;
    std::map<SeriesID, std::vector<MemTableEntry>> data_;
    size_t total_size_ = 0;
};

}

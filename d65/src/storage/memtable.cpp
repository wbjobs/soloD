#include "storage/memtable.h"

namespace timescale::storage {

bool MemTable::insert(SeriesID series_id, const Point& point) {
    std::unique_lock lock(mutex_);
    
    MemTableEntry entry;
    entry.timestamp = point.timestamp;
    entry.fields = point.fields;
    
    data_[series_id].push_back(std::move(entry));
    total_size_ += sizeof(MemTableEntry) + point.fields.size() * sizeof(std::pair<std::string, double>);
    
    return true;
}

size_t MemTable::size() const {
    std::shared_lock lock(mutex_);
    return total_size_;
}

size_t MemTable::entry_count() const {
    std::shared_lock lock(mutex_);
    size_t count = 0;
    for (const auto& [series, entries] : data_) {
        count += entries.size();
    }
    return count;
}

bool MemTable::should_flush(size_t threshold) const {
    return size() >= threshold;
}

const std::map<SeriesID, std::vector<MemTableEntry>>& MemTable::data() const {
    return data_;
}

void MemTable::clear() {
    std::unique_lock lock(mutex_);
    data_.clear();
    total_size_ = 0;
}

}

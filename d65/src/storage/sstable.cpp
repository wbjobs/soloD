#include "storage/sstable.h"
#include <algorithm>

namespace timescale::storage {

SSTable::SSTable(const std::string& path) : path_(path) {}

SSTable::~SSTable() = default;

bool SSTable::write(const std::vector<SSTableEntry>& entries) {
    std::ofstream file(path_, std::ios::binary);
    if (!file.is_open()) return false;

    std::map<SeriesID, std::vector<const SSTableEntry*>> series_map;
    for (const auto& entry : entries) {
        series_map[entry.series_id].push_back(&entry);
    }

    uint64_t offset = 0;
    for (auto& [series_id, entry_ptrs] : series_map) {
        SSTableIndex idx;
        idx.series_id = series_id;
        idx.offset = offset;
        
        std::sort(entry_ptrs.begin(), entry_ptrs.end(),
            [](const SSTableEntry* a, const SSTableEntry* b) {
                return a->timestamp < b->timestamp;
            });
        
        idx.min_time = entry_ptrs.front()->timestamp;
        idx.max_time = entry_ptrs.back()->timestamp;
        
        if (min_time_ == 0 || idx.min_time < min_time_) {
            min_time_ = idx.min_time;
        }
        if (idx.max_time > max_time_) {
            max_time_ = idx.max_time;
        }
        
        uint32_t entry_count = static_cast<uint32_t>(entry_ptrs.size());
        file.write(reinterpret_cast<const char*>(&entry_count), sizeof(uint32_t));
        offset += sizeof(uint32_t);
        
        for (const auto* entry : entry_ptrs) {
            file.write(reinterpret_cast<const char*>(&entry->timestamp), sizeof(Timestamp));
            offset += sizeof(Timestamp);
            
            size_t field_count = entry->fields.size();
            file.write(reinterpret_cast<const char*>(&field_count), sizeof(size_t));
            offset += sizeof(size_t);
            
            for (const auto& [key, value] : entry->fields) {
                size_t key_len = key.size();
                file.write(reinterpret_cast<const char*>(&key_len), sizeof(size_t));
                file.write(key.data(), key_len);
                file.write(reinterpret_cast<const char*>(&value), sizeof(double));
                offset += sizeof(size_t) + key_len + sizeof(double);
            }
        }
        
        idx.size = offset - idx.offset;
        index_.push_back(idx);
    }
    
    uint64_t index_offset = offset;
    uint32_t index_size = static_cast<uint32_t>(index_.size());
    file.write(reinterpret_cast<const char*>(&index_size), sizeof(uint32_t));
    
    for (const auto& idx : index_) {
        file.write(reinterpret_cast<const char*>(&idx.series_id), sizeof(SeriesID));
        file.write(reinterpret_cast<const char*>(&idx.min_time), sizeof(Timestamp));
        file.write(reinterpret_cast<const char*>(&idx.max_time), sizeof(Timestamp));
        file.write(reinterpret_cast<const char*>(&idx.offset), sizeof(uint64_t));
        file.write(reinterpret_cast<const char*>(&idx.size), sizeof(uint64_t));
    }
    
    file.write(reinterpret_cast<const char*>(&index_offset), sizeof(uint64_t));
    
    file.flush();
    file.close();
    is_loaded_ = true;
    
    return true;
}

bool SSTable::read(SeriesID series_id, Timestamp start, Timestamp end,
                   std::vector<SSTableEntry>& results) const {
    if (!is_loaded_) {
        const_cast<SSTable*>(this)->load_index();
    }

    auto it = std::find_if(index_.begin(), index_.end(),
        [series_id, start, end](const SSTableIndex& idx) {
            return idx.series_id == series_id && 
                   !(idx.max_time < start || idx.min_time > end);
        });
    
    if (it == index_.end()) return true;

    std::ifstream file(path_, std::ios::binary);
    if (!file.is_open()) return false;

    file.seekg(it->offset);
    
    uint32_t entry_count;
    file.read(reinterpret_cast<char*>(&entry_count), sizeof(uint32_t));
    
    for (uint32_t i = 0; i < entry_count; ++i) {
        SSTableEntry entry;
        entry.series_id = series_id;
        
        file.read(reinterpret_cast<char*>(&entry.timestamp), sizeof(Timestamp));
        
        if (entry.timestamp < start || entry.timestamp > end) {
            size_t field_count;
            file.read(reinterpret_cast<char*>(&field_count), sizeof(size_t));
            for (size_t j = 0; j < field_count; ++j) {
                size_t key_len;
                file.read(reinterpret_cast<char*>(&key_len), sizeof(size_t));
                file.seekg(key_len, std::ios::cur);
                file.seekg(sizeof(double), std::ios::cur);
            }
            continue;
        }
        
        size_t field_count;
        file.read(reinterpret_cast<char*>(&field_count), sizeof(size_t));
        for (size_t j = 0; j < field_count; ++j) {
            size_t key_len;
            file.read(reinterpret_cast<char*>(&key_len), sizeof(size_t));
            std::string key(key_len, '\0');
            file.read(key.data(), key_len);
            double value;
            file.read(reinterpret_cast<char*>(&value), sizeof(double));
            entry.fields[key] = value;
        }
        
        results.push_back(std::move(entry));
    }
    
    return true;
}

bool SSTable::load_index() {
    std::ifstream file(path_, std::ios::binary);
    if (!file.is_open()) return false;
    
    file.seekg(-static_cast<int64_t>(sizeof(uint64_t)), std::ios::end);
    uint64_t index_offset;
    file.read(reinterpret_cast<char*>(&index_offset), sizeof(uint64_t));
    
    file.seekg(index_offset);
    
    uint32_t index_size;
    file.read(reinterpret_cast<char*>(&index_size), sizeof(uint32_t));
    
    index_.clear();
    for (uint32_t i = 0; i < index_size; ++i) {
        SSTableIndex idx;
        file.read(reinterpret_cast<char*>(&idx.series_id), sizeof(SeriesID));
        file.read(reinterpret_cast<char*>(&idx.min_time), sizeof(Timestamp));
        file.read(reinterpret_cast<char*>(&idx.max_time), sizeof(Timestamp));
        file.read(reinterpret_cast<char*>(&idx.offset), sizeof(uint64_t));
        file.read(reinterpret_cast<char*>(&idx.size), sizeof(uint64_t));
        index_.push_back(idx);
    }
    
    is_loaded_ = true;
    return true;
}

const std::vector<SSTableIndex>& SSTable::index() const {
    return index_;
}

const std::string& SSTable::path() const {
    return path_;
}

Timestamp SSTable::min_time() const {
    return min_time_;
}

Timestamp SSTable::max_time() const {
    return max_time_;
}

}

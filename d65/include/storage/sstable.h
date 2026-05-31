#pragma once

#include "common/common.h"
#include <vector>
#include <string>
#include <fstream>

namespace timescale::storage {

struct SSTableEntry {
    SeriesID series_id;
    Timestamp timestamp;
    std::unordered_map<std::string, double> fields;
};

struct SSTableIndex {
    SeriesID series_id;
    Timestamp min_time;
    Timestamp max_time;
    uint64_t offset;
    uint64_t size;
};

class SSTable {
public:
    explicit SSTable(const std::string& path);
    ~SSTable();

    bool write(const std::vector<SSTableEntry>& entries);
    bool read(SeriesID series_id, Timestamp start, Timestamp end,
              std::vector<SSTableEntry>& results) const;
    
    const std::vector<SSTableIndex>& index() const;
    const std::string& path() const;
    
    Timestamp min_time() const;
    Timestamp max_time() const;

private:
    bool load_index();

    std::string path_;
    std::vector<SSTableIndex> index_;
    Timestamp min_time_ = 0;
    Timestamp max_time_ = 0;
    bool is_loaded_ = false;
};

}

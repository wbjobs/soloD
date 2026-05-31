#pragma once

#include "common/common.h"
#include <vector>
#include <string>
#include <functional>

namespace timescale::index {

class BloomFilter {
public:
    explicit BloomFilter(size_t expected_elements = 100000, double false_positive_rate = 0.01);
    ~BloomFilter() = default;

    void add(const std::string& key);
    void add(uint64_t key);
    
    bool contains(const std::string& key) const;
    bool contains(uint64_t key) const;
    
    void clear();
    
    size_t memory_usage() const;

private:
    size_t hash_count_;
    std::vector<bool> bit_array_;
    
    uint64_t hash1(const std::string& key) const;
    uint64_t hash2(const std::string& key) const;
    uint64_t hash3(const std::string& key) const;
};

}

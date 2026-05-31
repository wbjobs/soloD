#include "index/bloom_filter.h"
#include <cmath>
#include <cstring>

namespace timescale::index {

BloomFilter::BloomFilter(size_t expected_elements, double false_positive_rate) {
    double m = -(static_cast<double>(expected_elements) * std::log(false_positive_rate)) 
               / (std::log(2) * std::log(2));
    size_t bit_size = static_cast<size_t>(m);
    
    hash_count_ = static_cast<size_t>((bit_size / static_cast<double>(expected_elements)) * std::log(2));
    if (hash_count_ < 1) hash_count_ = 1;
    if (hash_count_ > 8) hash_count_ = 8;
    
    bit_array_.resize(bit_size, false);
}

void BloomFilter::add(const std::string& key) {
    uint64_t h1 = hash1(key);
    uint64_t h2 = hash2(key);
    uint64_t h3 = hash3(key);
    
    for (size_t i = 0; i < hash_count_; ++i) {
        uint64_t hash = h1 + i * h2 + i * i * h3;
        size_t index = hash % bit_array_.size();
        bit_array_[index] = true;
    }
}

void BloomFilter::add(uint64_t key) {
    add(std::string(reinterpret_cast<const char*>(&key), sizeof(key)));
}

bool BloomFilter::contains(const std::string& key) const {
    uint64_t h1 = hash1(key);
    uint64_t h2 = hash2(key);
    uint64_t h3 = hash3(key);
    
    for (size_t i = 0; i < hash_count_; ++i) {
        uint64_t hash = h1 + i * h2 + i * i * h3;
        size_t index = hash % bit_array_.size();
        if (!bit_array_[index]) {
            return false;
        }
    }
    return true;
}

bool BloomFilter::contains(uint64_t key) const {
    return contains(std::string(reinterpret_cast<const char*>(&key), sizeof(key)));
}

void BloomFilter::clear() {
    std::fill(bit_array_.begin(), bit_array_.end(), false);
}

size_t BloomFilter::memory_usage() const {
    return bit_array_.size() / 8;
}

uint64_t BloomFilter::hash1(const std::string& key) const {
    uint64_t result = 0;
    for (char c : key) {
        result = (result << 5) + result + c;
    }
    return result;
}

uint64_t BloomFilter::hash2(const std::string& key) const {
    uint64_t result = 5381;
    for (char c : key) {
        result = ((result << 5) + result) + c;
    }
    return result;
}

uint64_t BloomFilter::hash3(const std::string& key) const {
    uint64_t result = 0;
    for (char c : key) {
        result = result * 37 + c;
    }
    return result;
}

}

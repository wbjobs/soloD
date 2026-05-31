#pragma once

#include "core/common.h"
#include <vector>
#include <bitset>
#include <array>

namespace timescale {

class BloomFilter {
public:
    BloomFilter(size_t expected_entries, size_t num_hashes = 4)
        : num_hashes_(num_hashes),
          bit_count_(expected_entries * BLOOM_FILTER_BITS_PER_ENTRY),
          bits_(bit_count_, false) {}

    void insert(SeriesID id) {
        for (size_t i = 0; i < num_hashes_; ++i) {
            size_t hash = hash_id(id, i);
            bits_[hash % bit_count_] = true;
        }
    }

    bool might_contain(SeriesID id) const {
        for (size_t i = 0; i < num_hashes_; ++i) {
            size_t hash = hash_id(id, i);
            if (!bits_[hash % bit_count_]) {
                return false;
            }
        }
        return true;
    }

    void clear() {
        std::fill(bits_.begin(), bits_.end(), false);
    }

private:
    size_t hash_id(SeriesID id, size_t seed) const {
        uint64_t h = id;
        h ^= h >> 33;
        h *= 0xff51afd7ed558ccdULL;
        h ^= h >> 33;
        h *= 0xc4ceb9fe1a85ec53ULL;
        h ^= h >> 33;
        return static_cast<size_t>(h + seed * 0x9e3779b97f4a7c15ULL);
    }

    size_t num_hashes_;
    size_t bit_count_;
    std::vector<bool> bits_;
};

}

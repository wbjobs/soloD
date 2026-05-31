#pragma once

#include <cstdint>
#include <string>
#include <vector>
#include <map>
#include <unordered_map>
#include <memory>
#include <mutex>
#include <shared_mutex>
#include <chrono>
#include <functional>
#include <algorithm>
#include <numeric>
#include <cmath>
#include <cstring>
#include <immintrin.h>

namespace timescale {

using Timestamp = int64_t;
using SeriesID = uint64_t;
using TagValue = std::string;
using FieldValue = double;

constexpr Timestamp SECOND = 1000000000LL;
constexpr Timestamp MINUTE = 60 * SECOND;
constexpr Timestamp HOUR = 60 * MINUTE;
constexpr Timestamp DAY = 24 * HOUR;
constexpr Timestamp WEEK = 7 * DAY;

constexpr size_t MEMTABLE_SIZE = 128 * 1024 * 1024;
constexpr size_t SSTABLE_BLOCK_SIZE = 64 * 1024;
constexpr size_t BLOOM_FILTER_BITS_PER_ENTRY = 10;

enum class FieldType {
    INTEGER,
    FLOAT,
    STRING,
    BOOLEAN
};

struct Field {
    std::string key;
    FieldType type;
    FieldValue value;
};

struct Point {
    std::string measurement;
    std::map<std::string, TagValue> tags;
    std::vector<Field> fields;
    Timestamp timestamp;

    std::string get_series_key() const {
        std::string key = measurement;
        for (const auto& [k, v] : tags) {
            key += "|" + k + "=" + v;
        }
        return key;
    }
};

struct Series {
    SeriesID id;
    std::string measurement;
    std::map<std::string, TagValue> tags;
};

enum class AggregationType {
    MEAN,
    MAX,
    MIN,
    SUM,
    COUNT
};

struct Aggregation {
    AggregationType type;
    std::string field;
};

struct Query {
    std::string measurement;
    std::map<std::string, TagValue> tags;
    Timestamp start_time;
    Timestamp end_time;
    std::vector<Aggregation> aggregations;
    std::vector<std::string> group_by;
    Timestamp group_by_time;
};

struct QueryResult {
    std::vector<std::map<std::string, TagValue>> series;
    std::vector<std::vector<std::pair<Timestamp, FieldValue>>> data;
};

inline Timestamp now_nanos() {
    return std::chrono::duration_cast<std::chrono::nanoseconds>(
        std::chrono::system_clock::now().time_since_epoch()
    ).count();
}

inline uint64_t hash_string(const std::string& s) {
    uint64_t h = 14695981039346656037ULL;
    for (char c : s) {
        h ^= static_cast<uint64_t>(c);
        h *= 1099511628211ULL;
    }
    return h;
}

}

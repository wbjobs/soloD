#pragma once

#include <cstdint>
#include <string>
#include <vector>
#include <map>
#include <unordered_map>
#include <memory>
#include <mutex>
#include <shared_mutex>
#include <atomic>
#include <chrono>
#include <algorithm>
#include <numeric>
#include <cmath>
#include <cstring>

namespace timescale {

using Timestamp = int64_t;
using SeriesID = uint64_t;
using TagMap = std::map<std::string, std::string>;

constexpr Timestamp SECOND = 1000000000LL;
constexpr Timestamp MINUTE = 60 * SECOND;
constexpr Timestamp HOUR = 60 * MINUTE;
constexpr Timestamp DAY = 24 * HOUR;
constexpr Timestamp WEEK = 7 * DAY;

struct Point {
    std::string measurement;
    TagMap tags;
    Timestamp timestamp;
    std::unordered_map<std::string, double> fields;
};

enum class AggregationType {
    MEAN,
    MAX,
    MIN,
    SUM,
    COUNT
};

struct QueryResult {
    std::vector<std::string> columns;
    std::vector<std::vector<double>> values;
    size_t row_count = 0;
};

inline Timestamp now() {
    return std::chrono::duration_cast<std::chrono::nanoseconds>(
        std::chrono::system_clock::now().time_since_epoch()
    ).count();
}

template<typename T>
inline T clamp(T value, T min, T max) {
    return std::min(std::max(value, min), max);
}

}

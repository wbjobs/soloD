#include "core/common.h"
#include "storage/memtable.h"
#include "index/inverted_index.h"
#include "index/ttl_manager.h"
#include "query/query_engine.h"
#include <iostream>
#include <cassert>
#include <memory>
#include <vector>
#include <cmath>

using namespace timescale;

void test_time_window_boundary_exclusive() {
    std::cout << "Test 1: Time window boundary exclusive semantics [start, end)" << std::endl;
    
    MemTable memtable;
    SeriesID sid = 1;
    const Timestamp HOUR = 3600 * SECOND;
    
    Timestamp t0 = 0;
    Timestamp t1 = HOUR;
    Timestamp t2 = 2 * HOUR;
    
    memtable.insert(sid, t0, {10.0});
    memtable.insert(sid, t1, {20.0});
    memtable.insert(sid, t2, {30.0});
    
    auto range1 = memtable.get_range(sid, 0, HOUR);
    assert(range1.size() == 1);
    assert(range1[0].first == t0);
    assert(std::abs(range1[0].second[0] - 10.0) < 0.001);
    std::cout << "  ✓ [0, 1h) contains only t0" << std::endl;
    
    auto range2 = memtable.get_range(sid, HOUR, 2 * HOUR);
    assert(range2.size() == 1);
    assert(range2[0].first == t1);
    assert(std::abs(range2[0].second[0] - 20.0) < 0.001);
    std::cout << "  ✓ [1h, 2h) contains only t1" << std::endl;
    
    auto range3 = memtable.get_range(sid, 0, 2 * HOUR);
    assert(range3.size() == 2);
    std::cout << "  ✓ [0, 2h) contains t0 and t1 (not t2)" << std::endl;
    
    std::cout << "  ✓ All boundary tests passed!" << std::endl;
}

void test_group_by_window_no_duplicate_count() {
    std::cout << "\nTest 2: GROUP BY window boundary - no double counting" << std::endl;
    
    auto inverted_index = std::make_shared<InvertedIndex>();
    auto memtable = std::make_shared<MemTable>();
    auto ttl_manager = std::make_shared<TTLManager>("./data", WEEK);
    auto query_engine = std::make_shared<QueryEngine>(inverted_index, memtable, ttl_manager, "./data");
    
    std::map<std::string, TagValue> tags = {{"host", "server1"}};
    SeriesID sid = inverted_index->get_or_create_series("cpu", tags);
    
    const Timestamp HOUR = 3600 * SECOND;
    
    for (int i = 0; i <= 3; ++i) {
        Timestamp ts = i * HOUR;
        memtable->insert(sid, ts, {100.0});
    }
    
    Query query;
    query.measurement = "cpu";
    query.start_time = 0;
    query.end_time = 3 * HOUR;
    query.group_by_time = HOUR;
    query.aggregations.push_back({AggregationType::COUNT, "value"});
    
    QueryResult result = query_engine->execute(query);
    
    assert(result.data.size() == 1);
    size_t total_count = 0;
    for (const auto& [ts, val] : result.data[0]) {
        total_count += static_cast<size_t>(val);
    }
    
    assert(total_count == 3);
    std::cout << "  ✓ Total count = 3 (t0, t1, t2 in [0, 3h)), t3 excluded" << std::endl;
    std::cout << "  ✓ No duplicate counting at boundaries!" << std::endl;
}

void test_group_by_window_sum_no_duplication() {
    std::cout << "\nTest 3: GROUP BY window - SUM verification" << std::endl;
    
    auto inverted_index = std::make_shared<InvertedIndex>();
    auto memtable = std::make_shared<MemTable>();
    auto ttl_manager = std::make_shared<TTLManager>("./data", WEEK);
    auto query_engine = std::make_shared<QueryEngine>(inverted_index, memtable, ttl_manager, "./data");
    
    std::map<std::string, TagValue> tags = {{"host", "server1"}};
    SeriesID sid = inverted_index->get_or_create_series("cpu", tags);
    
    const Timestamp HOUR = 3600 * SECOND;
    
    memtable->insert(sid, HOUR - 1000, {1.0});
    memtable->insert(sid, HOUR, {10.0});
    memtable->insert(sid, HOUR + 1000, {100.0});
    
    Query query;
    query.measurement = "cpu";
    query.start_time = 0;
    query.end_time = 2 * HOUR;
    query.group_by_time = HOUR;
    query.aggregations.push_back({AggregationType::SUM, "value"});
    
    QueryResult result = query_engine->execute(query);
    assert(result.data.size() == 1);
    
    double total_sum = 0;
    for (const auto& [ts, val] : result.data[0]) {
        total_sum += val;
        if (ts == 0) {
            assert(std::abs(val - 1.0) < 0.001);
            std::cout << "  ✓ Window [0, 1h) sum = 1.0" << std::endl;
        } else if (ts == HOUR) {
            assert(std::abs(val - 110.0) < 0.001);
            std::cout << "  ✓ Window [1h, 2h) sum = 110.0 (10 + 100)" << std::endl;
        }
    }
    
    assert(std::abs(total_sum - 111.0) < 0.001);
    std::cout << "  ✓ SUM aggregation correct, no duplication!" << std::endl;
}

void test_boundary_point_belongs_to_exactly_one_window() {
    std::cout << "\nTest 4: Boundary point belongs to exactly one window" << std::endl;
    
    auto inverted_index = std::make_shared<InvertedIndex>();
    auto memtable = std::make_shared<MemTable>();
    auto ttl_manager = std::make_shared<TTLManager>("./data", WEEK);
    auto query_engine = std::make_shared<QueryEngine>(inverted_index, memtable, ttl_manager, "./data");
    
    std::map<std::string, TagValue> tags = {{"host", "server1"}};
    SeriesID sid = inverted_index->get_or_create_series("cpu", tags);
    
    const Timestamp HOUR = 3600 * SECOND;
    memtable->insert(sid, HOUR, {999.0});
    
    Query query;
    query.measurement = "cpu";
    query.start_time = 0;
    query.end_time = 2 * HOUR;
    query.group_by_time = HOUR;
    query.aggregations.push_back({AggregationType::COUNT, "value"});
    
    QueryResult result = query_engine->execute(query);
    assert(result.data.size() == 1);
    
    size_t occurrences = 0;
    for (const auto& [ts, val] : result.data[0]) {
        if (val > 0) {
            occurrences++;
        }
    }
    
    assert(occurrences == 1);
    std::cout << "  ✓ Boundary point appears in exactly one window" << std::endl;
    
    for (const auto& [ts, val] : result.data[0]) {
        if (ts == HOUR && val == 1) {
            std::cout << "  ✓ Point at boundary belongs to the [1h, 2h) window" << std::endl;
        }
    }
}

void test_mixed_boundary_scenarios() {
    std::cout << "\nTest 5: Mixed boundary scenarios" << std::endl;
    
    MemTable memtable;
    SeriesID sid = 1;
    const Timestamp HOUR = 3600 * SECOND;
    
    for (int i = 0; i < 100; ++i) {
        memtable.insert(sid, i * 1000, {static_cast<double>(i)});
    }
    
    auto range = memtable.get_range(sid, 10000, 50000);
    assert(range.size() == 40);
    
    assert(range[0].first == 10000);
    assert(range.back().first == 49000);
    
    std::cout << "  ✓ Range [10s, 50s) contains 40 points (10s to 49s)" << std::endl;
    std::cout << "  ✓ First point at 10s (inclusive), last at 49s (50s exclusive)" << std::endl;
}

int main() {
    std::cout << "========================================" << std::endl;
    std::cout << "  Time Window Boundary Regression Tests" << std::endl;
    std::cout << "========================================" << std::endl;
    std::cout << std::endl;
    
    test_time_window_boundary_exclusive();
    test_group_by_window_no_duplicate_count();
    test_group_by_window_sum_no_duplication();
    test_boundary_point_belongs_to_exactly_one_window();
    test_mixed_boundary_scenarios();
    
    std::cout << std::endl;
    std::cout << "========================================" << std::endl;
    std::cout << "  ALL TESTS PASSED!" << std::endl;
    std::cout << "========================================" << std::endl;
    
    return 0;
}

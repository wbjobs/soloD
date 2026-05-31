#include "storage/lsm_tree.h"
#include "index/series_manager.h"
#include "common/common.h"
#include <iostream>
#include <chrono>
#include <vector>
#include <random>
#include <thread>

using namespace timescale;
using namespace timescale::storage;
using namespace timescale::index;

void benchmark_write_throughput(size_t num_points) {
    std::cout << "=== Write Throughput Benchmark ===" << std::endl;
    std::cout << "Writing " << num_points << " points..." << std::endl;
    
    LSMTree storage;
    SeriesManager series_manager;
    
    storage.start();
    
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_real_distribution<double> value_dist(0.0, 100.0);
    std::uniform_int_distribution<int> tag_dist(1, 100);
    
    auto start = std::chrono::high_resolution_clock::now();
    
    for (size_t i = 0; i < num_points; i++) {
        Point point;
        point.measurement = "cpu";
        point.timestamp = now();
        
        point.tags["host"] = "server-" + std::to_string(tag_dist(gen) % 10);
        point.tags["region"] = "region-" + std::to_string(tag_dist(gen) % 5);
        point.tags["rack"] = "rack-" + std::to_string(tag_dist(gen) % 20);
        
        point.fields["usage"] = value_dist(gen);
        point.fields["idle"] = 100.0 - point.fields["usage"];
        point.fields["system"] = value_dist(gen) * 0.3;
        point.fields["user"] = value_dist(gen) * 0.6;
        
        series_manager.get_or_create_series(point.measurement, point.tags);
        storage.insert(point);
    }
    
    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
    
    double throughput = static_cast<double>(num_points) / (duration.count() / 1000.0);
    
    std::cout << "Total time: " << duration.count() << " ms" << std::endl;
    std::cout << "Throughput: " << throughput << " points/sec" << std::endl;
    std::cout << "Target: 100,000 points/sec - " 
              << (throughput >= 100000 ? "PASSED" : "FAILED") 
              << std::endl;
    
    storage.stop();
}

void benchmark_batch_write(size_t batch_size, size_t num_batches) {
    std::cout << "\n=== Batch Write Benchmark ===" << std::endl;
    std::cout << "Batch size: " << batch_size << ", Batches: " << num_batches << std::endl;
    
    LSMTree storage;
    SeriesManager series_manager;
    
    storage.start();
    
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_real_distribution<double> value_dist(0.0, 100.0);
    std::uniform_int_distribution<int> tag_dist(1, 100);
    
    size_t total_points = batch_size * num_batches;
    
    auto start = std::chrono::high_resolution_clock::now();
    
    for (size_t b = 0; b < num_batches; b++) {
        std::vector<Point> batch;
        batch.reserve(batch_size);
        
        for (size_t i = 0; i < batch_size; i++) {
            Point point;
            point.measurement = "mem";
            point.timestamp = now();
            
            point.tags["host"] = "server-" + std::to_string(tag_dist(gen) % 10);
            point.tags["region"] = "region-" + std::to_string(tag_dist(gen) % 5);
            
            point.fields["used"] = value_dist(gen);
            point.fields["available"] = 100.0 - point.fields["used"];
            
            series_manager.get_or_create_series(point.measurement, point.tags);
            batch.push_back(std::move(point));
        }
        
        storage.insert_batch(batch);
    }
    
    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
    
    double throughput = static_cast<double>(total_points) / (duration.count() / 1000.0);
    
    std::cout << "Total points: " << total_points << std::endl;
    std::cout << "Total time: " << duration.count() << " ms" << std::endl;
    std::cout << "Throughput: " << throughput << " points/sec" << std::endl;
    std::cout << "Target: 100,000 points/sec - " 
              << (throughput >= 100000 ? "PASSED" : "FAILED") 
              << std::endl;
    
    storage.stop();
}

void benchmark_query_latency(size_t num_points) {
    std::cout << "\n=== Query Latency Benchmark ===" << std::endl;
    
    LSMTree storage;
    SeriesManager series_manager;
    
    storage.start();
    
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_real_distribution<double> value_dist(0.0, 100.0);
    
    Timestamp start_time = now();
    
    for (size_t i = 0; i < num_points; i++) {
        Point point;
        point.measurement = "cpu";
        point.timestamp = start_time + i * 1000000000LL;
        
        point.tags["host"] = "server-1";
        point.tags["region"] = "region-1";
        
        point.fields["usage"] = value_dist(gen);
        
        series_manager.get_or_create_series(point.measurement, point.tags);
        storage.insert(point);
    }
    
    std::cout << "Data loaded: " << num_points << " points" << std::endl;
    
    auto series_ids = series_manager.find_series("cpu", {{"host", "server-1"}, {"region", "region-1"}});
    
    if (series_ids.empty()) {
        std::cout << "No series found!" << std::endl;
        return;
    }
    
    SeriesID sid = series_ids[0];
    
    auto query_start = std::chrono::high_resolution_clock::now();
    
    std::vector<Point> results;
    storage.query(sid, start_time, start_time + num_points * 1000000000LL, results);
    
    auto query_end = std::chrono::high_resolution_clock::now();
    auto query_duration = std::chrono::duration_cast<std::chrono::microseconds>(query_end - query_start);
    
    std::cout << "Query returned: " << results.size() << " points" << std::endl;
    std::cout << "Query latency: " << query_duration.count() << " microseconds" << std::endl;
    std::cout << "Points per second: " 
              << (static_cast<double>(results.size()) / (query_duration.count() / 1000000.0))
              << std::endl;
    
    storage.stop();
}

void benchmark_series_manager(size_t num_series) {
    std::cout << "\n=== Series Manager Benchmark ===" << std::endl;
    std::cout << "Creating " << num_series << " unique series..." << std::endl;
    
    SeriesManager series_manager;
    
    std::random_device rd;
    std::mt19937 gen(rd());
    std::uniform_int_distribution<int> tag_dist(1, 10000);
    
    auto start = std::chrono::high_resolution_clock::now();
    
    for (size_t i = 0; i < num_series; i++) {
        TagMap tags;
        tags["host"] = "server-" + std::to_string(tag_dist(gen));
        tags["region"] = "region-" + std::to_string(tag_dist(gen) % 10);
        tags["rack"] = "rack-" + std::to_string(tag_dist(gen) % 100);
        
        series_manager.get_or_create_series("cpu", tags);
    }
    
    auto end = std::chrono::high_resolution_clock::now();
    auto duration = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
    
    std::cout << "Total series: " << series_manager.series_count() << std::endl;
    std::cout << "Total time: " << duration.count() << " ms" << std::endl;
    std::cout << "Throughput: " 
              << static_cast<double>(num_series) / (duration.count() / 1000.0) 
              << " series/sec" << std::endl;
    
    auto filter_start = std::chrono::high_resolution_clock::now();
    
    auto filtered = series_manager.find_series_by_tags({{"region", "region-1"}});
    
    auto filter_end = std::chrono::high_resolution_clock::now();
    auto filter_duration = std::chrono::duration_cast<std::chrono::microseconds>(filter_end - filter_start);
    
    std::cout << "Filter query returned: " << filtered.size() << " series" << std::endl;
    std::cout << "Filter latency: " << filter_duration.count() << " microseconds" << std::endl;
}

int main() {
    std::cout << "========================================" << std::endl;
    std::cout << "TimeSeries Database Performance Tests" << std::endl;
    std::cout << "========================================" << std::endl;
    
    benchmark_write_throughput(100000);
    benchmark_batch_write(1000, 100);
    benchmark_query_latency(10000);
    benchmark_series_manager(10000);
    
    std::cout << "\n========================================" << std::endl;
    std::cout << "All tests completed!" << std::endl;
    std::cout << "========================================" << std::endl;
    
    return 0;
}

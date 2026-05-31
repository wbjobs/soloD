#include "core/common.h"
#include "storage/memtable.h"
#include "index/inverted_index.h"
#include <iostream>
#include <memory>
#include <chrono>
#include <vector>
#include <thread>
#include <iomanip>

using namespace timescale;

void run_benchmark(int num_points, int num_series) {
    std::cout << "=========================================" << std::endl;
    std::cout << "  Write Performance Benchmark           " << std::endl;
    std::cout << "=========================================" << std::endl;
    std::cout << "Target: " << num_points << " points across " << num_series << " series" << std::endl;
    std::cout << std::endl;

    auto inverted_index = std::make_shared<InvertedIndex>();
    auto memtable = std::make_shared<MemTable>();

    std::cout << "Preparing series IDs..." << std::endl;
    std::vector<SeriesID> series_ids;
    for (int i = 0; i < num_series; ++i) {
        std::map<std::string, TagValue> tags;
        tags["host"] = "server-" + std::to_string(i);
        tags["region"] = "us-west";
        series_ids.push_back(inverted_index->get_or_create_series("cpu", tags));
    }
    std::cout << "  ✓ " << num_series << " series created" << std::endl;
    std::cout << std::endl;

    std::cout << "Running benchmark..." << std::endl;
    auto start = std::chrono::high_resolution_clock::now();

    Timestamp base_time = now_nanos();
    int points_written = 0;

    for (int i = 0; i < num_points; ++i) {
        SeriesID sid = series_ids[i % num_series];
        Timestamp ts = base_time + i * 1000000LL;
        std::vector<FieldValue> values = {static_cast<double>(rand() % 100) / 100.0 * 100.0};

        memtable->insert(sid, ts, values);
        points_written++;

        if (points_written % 100000 == 0) {
            auto now = std::chrono::high_resolution_clock::now();
            auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(now - start);
            double throughput = static_cast<double>(points_written) / (elapsed.count() / 1000.0);

            std::cout << "  Progress: " << std::setw(8) << points_written
                      << " points | Throughput: " << std::fixed << std::setprecision(2)
                      << throughput << " points/sec" << std::endl;
        }
    }

    auto end = std::chrono::high_resolution_clock::now();
    auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(end - start);
    double throughput = static_cast<double>(num_points) / (elapsed.count() / 1000.0);

    std::cout << std::endl;
    std::cout << "=========================================" << std::endl;
    std::cout << "  Benchmark Results                     " << std::endl;
    std::cout << "=========================================" << std::endl;
    std::cout << "Total points:      " << num_points << std::endl;
    std::cout << "Total time:        " << elapsed.count() << " ms" << std::endl;
    std::cout << "Throughput:        " << std::fixed << std::setprecision(2)
              << throughput << " points/sec" << std::endl;
    std::cout << "Avg latency:       " << std::fixed << std::setprecision(6)
              << (elapsed.count() * 1000.0 / num_points) << " μs/point" << std::endl;

    if (throughput >= 100000.0) {
        std::cout << std::endl;
        std::cout << "  ✓ Target achieved: 100,000 points/sec" << std::endl;
    } else {
        std::cout << std::endl;
        std::cout << "  ✗ Below target: need optimization" << std::endl;
    }
    std::cout << std::endl;
}

int main() {
    std::cout << std::endl;
    run_benchmark(1000000, 1000);
    return 0;
}

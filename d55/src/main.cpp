#include "core/common.h"
#include "storage/memtable.h"
#include "storage/wal.h"
#include "storage/sstable.h"
#include "index/inverted_index.h"
#include "index/adaptive_index.h"
#include "index/ttl_manager.h"
#include "index/query_log.h"
#include "index/index_analyzer.h"
#include "index/index_recommendation.h"
#include "index/index_manager.h"
#include "query/query_engine.h"
#include "api/http_server.h"
#include <iostream>
#include <memory>
#include <thread>
#include <chrono>

using namespace timescale;

int main(int argc, char* argv[]) {
    std::cout << "=========================================" << std::endl;
    std::cout << "  Timescale Time-Series Database Engine " << std::endl;
    std::cout << "=========================================" << std::endl;
    std::cout << std::endl;

    int port = 8086;
    std::string data_dir = "./data";

    if (argc > 1) {
        port = std::atoi(argv[1]);
    }
    if (argc > 2) {
        data_dir = argv[2];
    }

    std::cout << "Initializing components..." << std::endl;

    auto inverted_index = std::make_shared<InvertedIndex>();
    auto memtable = std::make_shared<MemTable>();
    auto ttl_manager = std::make_shared<TTLManager>(data_dir, WEEK);
    auto query_logger = std::make_shared<QueryLogger>();
    auto recommendation_store = std::make_shared<RecommendationStore>();
    auto index_analyzer = std::make_shared<IndexAnalyzer>();
    auto index_manager = std::make_shared<IndexManager>(
        query_logger, recommendation_store, index_analyzer, 10, 7);
    auto query_engine = std::make_shared<QueryEngine>(
        inverted_index, memtable, ttl_manager, data_dir);

    std::cout << "  ✓ Inverted Index initialized" << std::endl;
    std::cout << "  ✓ MemTable initialized" << std::endl;
    std::cout << "  ✓ TTL Manager initialized" << std::endl;
    std::cout << "  ✓ Query Logger initialized" << std::endl;
    std::cout << "  ✓ Index Analyzer initialized" << std::endl;
    std::cout << "  ✓ Index Manager initialized" << std::endl;
    std::cout << "  ✓ Query Engine initialized" << std::endl;
    std::cout << std::endl;

    index_manager->start();
    std::cout << "  ✓ Index Manager background tasks started" << std::endl;
    std::cout << std::endl;

    auto http_server = std::make_shared<HttpServer>(
        port, query_engine, inverted_index, memtable, index_manager);

    std::cout << "Starting HTTP server on port " << port << "..." << std::endl;
    http_server->start();

    std::cout << "Server running! Press Ctrl+C to stop." << std::endl;
    std::cout << std::endl;
    std::cout << "Endpoints:" << std::endl;
    std::cout << "  POST /write   - Write data (InfluxDB line protocol)" << std::endl;
    std::cout << "  POST /query   - Query data (InfluxQL)" << std::endl;
    std::cout << "  GET  /health  - Health check" << std::endl;
    std::cout << std::endl;

    while (true) {
        std::this_thread::sleep_for(std::chrono::seconds(1));
    }

    http_server->stop();
    ttl_manager->stop();

    return 0;
}

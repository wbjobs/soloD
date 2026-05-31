#include "storage/lsm_tree.h"
#include "index/series_manager.h"
#include "index/adaptive_index.h"
#include "http/http_server.h"
#include <iostream>
#include <memory>
#include <chrono>
#include <thread>

int main(int argc, char* argv[]) {
    int port = 8086;
    int num_threads = 4;
    
    for (int i = 1; i < argc; i++) {
        std::string arg = argv[i];
        if (arg == "--port" && i + 1 < argc) {
            port = std::stoi(argv[++i]);
        } else if (arg == "--threads" && i + 1 < argc) {
            num_threads = std::stoi(argv[++i]);
        }
    }
    
    std::cout << "Starting TimeSeries Database..." << std::endl;
    std::cout << "Port: " << port << std::endl;
    std::cout << "Worker threads: " << num_threads << std::endl;
    
    timescale::storage::LSMTree storage;
    timescale::index::SeriesManager series_manager;
    timescale::index::AdaptiveIndexManager index_manager;
    
    storage.start();
    index_manager.start_maintenance();
    
    timescale::http::HttpServer server(port, num_threads);
    server.set_storage(&storage);
    server.set_series_manager(&series_manager);
    server.set_index_manager(&index_manager);
    
    if (!server.start()) {
        std::cerr << "Failed to start HTTP server" << std::endl;
        return 1;
    }
    
    std::cout << "Server started successfully!" << std::endl;
    std::cout << "InfluxDB-compatible endpoints available:" << std::endl;
    std::cout << "  POST /write - Write data (line protocol)" << std::endl;
    std::cout << "  GET /query - Query data (InfluxQL)" << std::endl;
    std::cout << "  GET /ping - Health check" << std::endl;
    std::cout << std::endl;
    std::cout << "Press Ctrl+C to stop..." << std::endl;
    
    while (server.is_running()) {
        std::this_thread::sleep_for(std::chrono::seconds(1));
    }
    
    server.stop();
    storage.stop();
    index_manager.stop_maintenance();
    
    std::cout << "Server stopped." << std::endl;
    
    return 0;
}

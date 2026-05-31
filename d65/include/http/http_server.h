#pragma once

#include "common/common.h"
#include "storage/lsm_tree.h"
#include "index/series_manager.h"
#include "index/adaptive_index.h"
#include "query/vectorized_executor.h"
#include <string>
#include <vector>
#include <map>
#include <thread>
#include <atomic>
#include <mutex>
#include <condition_variable>
#include <queue>
#include <functional>

namespace timescale::http {

struct HttpRequest {
    std::string method;
    std::string path;
    std::map<std::string, std::string> headers;
    std::map<std::string, std::string> query_params;
    std::string body;
};

struct HttpResponse {
    int status_code = 200;
    std::map<std::string, std::string> headers;
    std::string body;
    
    static HttpResponse ok(const std::string& content = "");
    static HttpResponse bad_request(const std::string& message = "Bad Request");
    static HttpResponse not_found(const std::string& message = "Not Found");
    static HttpResponse internal_error(const std::string& message = "Internal Server Error");
};

class InfluxQLParser {
public:
    struct Query {
        std::string measurement;
        TagMap where_tags;
        Timestamp start_time = 0;
        Timestamp end_time = INT64_MAX;
        std::vector<std::string> select_fields;
        std::vector<std::string> group_by_tags;
        Timestamp group_by_time = 0;
        query::VectorizedAggregator::AggFunc aggregation = query::VectorizedAggregator::AggFunc::COUNT;
        bool is_aggregation = false;
    };
    
    static Query parse(const std::string& query_string);
    static Timestamp parse_duration(const std::string& duration);
    static std::vector<Point> parse_line_protocol(const std::string& data);

private:
    static void trim(std::string& s);
    static std::vector<std::string> split(const std::string& s, char delimiter);
};

class HttpServer {
public:
    HttpServer(int port = 8086, int num_threads = 4);
    ~HttpServer();
    
    bool start();
    void stop();
    
    void set_storage(storage::LSMTree* storage) { storage_ = storage; }
    void set_series_manager(index::SeriesManager* manager) { series_manager_ = manager; }
    void set_index_manager(index::AdaptiveIndexManager* index) { index_manager_ = index; }
    
    bool is_running() const { return running_; }

private:
    using HandlerFunc = std::function<HttpResponse(const HttpRequest&)>;
    
    void worker_thread();
    void accept_thread();
    
    HttpResponse handle_write(const HttpRequest& req);
    HttpResponse handle_query(const HttpRequest& req);
    HttpResponse handle_ping(const HttpRequest& req);
    
    HttpResponse execute_query(const InfluxQLParser::Query& q);
    
    int port_;
    int num_threads_;
    std::atomic<bool> running_{false};
    
    std::thread accept_thread_;
    std::vector<std::thread> worker_threads_;
    
    std::queue<int> connection_queue_;
    std::mutex queue_mutex_;
    std::condition_variable queue_cv_;
    
    storage::LSMTree* storage_ = nullptr;
    index::SeriesManager* series_manager_ = nullptr;
    index::AdaptiveIndexManager* index_manager_ = nullptr;
    
    std::map<std::string, HandlerFunc> handlers_;
};

}

#pragma once

#include "core/common.h"
#include "query/query_engine.h"
#include "api/influx_parser.h"
#include "index/index_manager.h"
#include <string>
#include <functional>
#include <map>
#include <sstream>
#include <thread>
#include <atomic>
#include <mutex>

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#pragma comment(lib, "ws2_32.lib")
#else
#include <sys/socket.h>
#include <netinet/in.h>
#include <unistd.h>
#endif

namespace timescale {

struct HttpRequest {
    std::string method;
    std::string path;
    std::map<std::string, std::string> headers;
    std::map<std::string, std::string> params;
    std::string body;
};

struct HttpResponse {
    int status_code;
    std::string status_text;
    std::map<std::string, std::string> headers;
    std::string body;

    HttpResponse(int code = 200, const std::string& text = "OK")
        : status_code(code), status_text(text) {}

    std::string to_string() const {
        std::stringstream ss;
        ss << "HTTP/1.1 " << status_code << " " << status_text << "\r\n";
        for (const auto& [k, v] : headers) {
            ss << k << ": " << v << "\r\n";
        }
        ss << "Content-Length: " << body.size() << "\r\n";
        ss << "\r\n";
        ss << body;
        return ss.str();
    }
};

class HttpServer {
public:
    HttpServer(int port,
               std::shared_ptr<QueryEngine> query_engine,
               std::shared_ptr<InvertedIndex> inverted_index,
               std::shared_ptr<MemTable> memtable,
               std::shared_ptr<IndexManager> index_manager = nullptr)
        : port_(port),
          running_(false),
          query_engine_(query_engine),
          inverted_index_(inverted_index),
          memtable_(memtable),
          index_manager_(index_manager) {}

    ~HttpServer() {
        stop();
    }

    void start() {
#ifdef _WIN32
        WSADATA wsaData;
        WSAStartup(MAKEWORD(2, 2), &wsaData);
#endif

        server_socket_ = socket(AF_INET, SOCK_STREAM, 0);
        if (server_socket_ < 0) {
            return;
        }

        int opt = 1;
#ifdef _WIN32
        setsockopt(server_socket_, SOL_SOCKET, SO_REUSEADDR, (const char*)&opt, sizeof(opt));
#else
        setsockopt(server_socket_, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));
#endif

        sockaddr_in address{};
        address.sin_family = AF_INET;
        address.sin_addr.s_addr = INADDR_ANY;
        address.sin_port = htons(port_);

        if (bind(server_socket_, (sockaddr*)&address, sizeof(address)) < 0) {
            return;
        }

        listen(server_socket_, 10);

        running_ = true;
        server_thread_ = std::thread(&HttpServer::run, this);
    }

    void stop() {
        running_ = false;
        if (server_thread_.joinable()) {
            server_thread_.join();
        }
#ifdef _WIN32
        closesocket(server_socket_);
        WSACleanup();
#else
        close(server_socket_);
#endif
    }

private:
    void run() {
        while (running_) {
            sockaddr_in client_addr{};
#ifdef _WIN32
            int addr_len = sizeof(client_addr);
#else
            socklen_t addr_len = sizeof(client_addr);
#endif

            int client_socket = accept(server_socket_, (sockaddr*)&client_addr, &addr_len);
            if (client_socket < 0) continue;

            std::thread([this, client_socket]() {
                handle_client(client_socket);
            }).detach();
        }
    }

    void handle_client(int client_socket) {
        char buffer[4096];
        std::string request_data;

#ifdef _WIN32
        int bytes_read;
        while ((bytes_read = recv(client_socket, buffer, sizeof(buffer) - 1, 0)) > 0) {
            buffer[bytes_read] = '\0';
            request_data += buffer;
            if (request_data.find("\r\n\r\n") != std::string::npos) break;
        }
#else
        ssize_t bytes_read;
        while ((bytes_read = read(client_socket, buffer, sizeof(buffer) - 1)) > 0) {
            buffer[bytes_read] = '\0';
            request_data += buffer;
            if (request_data.find("\r\n\r\n") != std::string::npos) break;
        }
#endif

        HttpRequest req = parse_request(request_data);
        HttpResponse res = handle_request(req);

        std::string response_str = res.to_string();
#ifdef _WIN32
        send(client_socket, response_str.c_str(), response_str.size(), 0);
        closesocket(client_socket);
#else
        write(client_socket, response_str.c_str(), response_str.size());
        close(client_socket);
#endif
    }

    HttpRequest parse_request(const std::string& data) {
        HttpRequest req;
        std::stringstream ss(data);
        std::string line;

        std::getline(ss, line);
        std::stringstream line_ss(line);
        line_ss >> req.method >> req.path;

        size_t query_pos = req.path.find('?');
        if (query_pos != std::string::npos) {
            std::string query = req.path.substr(query_pos + 1);
            req.path = req.path.substr(0, query_pos);
            parse_query_params(query, req.params);
        }

        while (std::getline(ss, line) && line != "\r" && !line.empty()) {
            size_t colon = line.find(':');
            if (colon != std::string::npos) {
                std::string key = line.substr(0, colon);
                std::string value = trim(line.substr(colon + 1));
                req.headers[key] = value;
            }
        }

        return req;
    }

    void parse_query_params(const std::string& query, std::map<std::string, std::string>& params) {
        std::stringstream ss(query);
        std::string pair;
        while (std::getline(ss, pair, '&')) {
            size_t eq = pair.find('=');
            if (eq != std::string::npos) {
                std::string key = url_decode(pair.substr(0, eq));
                std::string value = url_decode(pair.substr(eq + 1));
                params[key] = value;
            }
        }
    }

    HttpResponse handle_request(const HttpRequest& req) {
        if (req.path == "/write" || req.path == "/api/v2/write") {
            return handle_write(req);
        }
        if (req.path == "/query" || req.path == "/api/v2/query") {
            return handle_query(req);
        }
        if (req.path == "/health" || req.path == "/ping") {
            HttpResponse res(200, "OK");
            res.headers["Content-Type"] = "application/json";
            res.body = R"({"status":"pass"})";
            return res;
        }
        if (req.path == "/api/v1/index/recommendations") {
            return handle_list_recommendations(req);
        }
        if (req.path.find("/api/v1/index/recommendations/") == 0) {
            return handle_recommendation_action(req);
        }
        if (req.path == "/api/v1/index/build-progress") {
            return handle_build_progress(req);
        }
        if (req.path == "/api/v1/index/analyze") {
            return handle_trigger_analysis(req);
        }
        if (req.path == "/api/v1/stats") {
            return handle_stats(req);
        }

        HttpResponse res(404, "Not Found");
        res.headers["Content-Type"] = "application/json";
        res.body = R"({"error":"not found"})";
        return res;
    }

    HttpResponse handle_list_recommendations(const HttpRequest& req) {
        if (!index_manager_) {
            return HttpResponse(503, "Service Unavailable");
        }

        auto recommendations = index_manager_->get_recommendations();
        std::string json = format_recommendations_json(recommendations);

        HttpResponse res(200, "OK");
        res.headers["Content-Type"] = "application/json";
        res.body = json;
        return res;
    }

    HttpResponse handle_recommendation_action(const HttpRequest& req) {
        if (!index_manager_) {
            return HttpResponse(503, "Service Unavailable");
        }

        size_t pos = req.path.find_last_of('/');
        if (pos == std::string::npos) {
            return HttpResponse(400, "Bad Request");
        }

        std::string rec_id = req.path.substr(pos + 1);
        std::string action = req.params.count("action") ? req.params.at("action") : "";

        if (req.method == "POST") {
            if (action == "approve") {
                if (index_manager_->approve_recommendation(rec_id)) {
                    HttpResponse res(200, "OK");
                    res.headers["Content-Type"] = "application/json";
                    res.body = R"({"status":"approved","id":")" + rec_id + R"("})";
                    return res;
                }
            } else if (action == "reject") {
                if (index_manager_->reject_recommendation(rec_id)) {
                    HttpResponse res(200, "OK");
                    res.headers["Content-Type"] = "application/json";
                    res.body = R"({"status":"rejected","id":")" + rec_id + R"("})";
                    return res;
                }
            }
        }

        return HttpResponse(400, "Bad Request");
    }

    HttpResponse handle_build_progress(const HttpRequest& req) {
        if (!index_manager_) {
            return HttpResponse(503, "Service Unavailable");
        }

        std::string rec_id = req.params.count("id") ? req.params.at("id") : "";
        if (rec_id.empty()) {
            return HttpResponse(400, "Bad Request");
        }

        auto progress = index_manager_->get_build_progress(rec_id);
        std::string json = format_progress_json(progress);

        HttpResponse res(200, "OK");
        res.headers["Content-Type"] = "application/json";
        res.body = json;
        return res;
    }

    HttpResponse handle_trigger_analysis(const HttpRequest& req) {
        if (!index_manager_) {
            return HttpResponse(503, "Service Unavailable");
        }

        index_manager_->trigger_analysis();

        HttpResponse res(200, "OK");
        res.headers["Content-Type"] = "application/json";
        res.body = R"({"status":"analysis_triggered"})";
        return res;
    }

    HttpResponse handle_stats(const HttpRequest& req) {
        std::stringstream ss;
        ss << "{";
        ss << R"("series_count":)" << inverted_index_->series_count() << ",";
        ss << R"("memtable_size":)" << memtable_->size() << ",";
        if (index_manager_) {
            ss << R"("build_queue_size":)" << index_manager_->get_build_queue_size();
        } else {
            ss << R"("build_queue_size":0)";
        }
        ss << "}";

        HttpResponse res(200, "OK");
        res.headers["Content-Type"] = "application/json";
        res.body = ss.str();
        return res;
    }

    std::string format_recommendations_json(const std::vector<IndexRecommendation>& recs) {
        std::stringstream ss;
        ss << R"({"recommendations":[)";

        for (size_t i = 0; i < recs.size(); ++i) {
            if (i > 0) ss << ",";
            const auto& rec = recs[i];
            ss << "{";
            ss << R"("id":")" << rec.recommendation_id << R"(",)";
            ss << R"("type":")" << (rec.type == RecommendationType::COMPOSITE_INDEX ? "index" : "materialized_view") << R"(",)";
            ss << R"("measurement":")" << rec.measurement << R"(",)";
            ss << R"("filter_tags":[)";
            for (size_t j = 0; j < rec.filter_tags.size(); ++j) {
                if (j > 0) ss << ",";
                ss << "\"" << rec.filter_tags[j] << "\"";
            }
            ss << "],";
            ss << R"("group_by_tags":[)";
            for (size_t j = 0; j < rec.group_by_tags.size(); ++j) {
                if (j > 0) ss << ",";
                ss << "\"" << rec.group_by_tags[j] << "\"";
            }
            ss << "],";
            ss << R"("frequency":)" << rec.frequency << ",";
            ss << R"("estimated_improvement_pct":)" << rec.estimated_improvement_pct << ",";
            ss << R"("estimated_storage_mb":)" << (rec.estimated_storage_bytes / (1024 * 1024)) << ",";
            ss << R"("estimated_build_time_seconds":)" << rec.estimated_build_time_seconds << ",";
            ss << R"("status":")" << static_cast<int>(rec.status) << R"(",)";
            ss << R"("use_count":)" << rec.use_count;
            ss << "}";
        }

        ss << "]}";
        return ss.str();
    }

    std::string format_progress_json(const IndexBuildProgress& progress) {
        std::stringstream ss;
        ss << "{";
        ss << R"("recommendation_id":")" << progress.recommendation_id << R"(",)";
        ss << R"("total_series":)" << progress.total_series << ",";
        ss << R"("processed_series":)" << progress.processed_series << ",";
        ss << R"("total_entries":)" << progress.total_entries << ",";
        ss << R"("processed_entries":)" << progress.processed_entries << ",";
        ss << R"("progress_pct":)" << (progress.total_entries > 0 ?
            (100.0 * progress.processed_entries / progress.total_entries) : 0) << ",";
        ss << R"("current_speed_entries_per_sec":)" << progress.current_speed_entries_per_sec;
        ss << "}";
        return ss.str();
    }

    HttpResponse handle_write(const HttpRequest& req) {
        std::string data = req.body;
        if (data.empty() && req.params.count("data")) {
            data = req.params.at("data");
        }

        std::stringstream ss(data);
        std::string line;
        while (std::getline(ss, line)) {
            if (!line.empty()) {
                Point point = parse_line_protocol(line);
                if (!point.measurement.empty()) {
                    auto sid = inverted_index_->get_or_create_series(
                        point.measurement, point.tags);

                    std::vector<FieldValue> values;
                    for (const auto& f : point.fields) {
                        values.push_back(f.value);
                    }

                    memtable_->insert(sid, point.timestamp, values);
                }
            }
        }

        HttpResponse res(204, "No Content");
        return res;
    }

    HttpResponse handle_query(const HttpRequest& req) {
        std::string query_str;
        if (req.params.count("q")) {
            query_str = req.params.at("q");
        } else {
            query_str = req.body;
        }

        Query query = InfluxQLParser::parse(query_str);
        QueryResult result = query_engine_->execute(query);

        std::string json = format_result_as_json(result);

        HttpResponse res(200, "OK");
        res.headers["Content-Type"] = "application/json";
        res.body = json;
        return res;
    }

    Point parse_line_protocol(const std::string& line) {
        Point point;
        std::stringstream ss(line);

        std::string measurement_part;
        std::getline(ss, measurement_part, ' ');

        size_t tags_start = measurement_part.find(',');
        if (tags_start != std::string::npos) {
            point.measurement = measurement_part.substr(0, tags_start);
            std::string tags_part = measurement_part.substr(tags_start + 1);

            std::stringstream tags_ss(tags_part);
            std::string tag_pair;
            while (std::getline(tags_ss, tag_pair, ',')) {
                size_t eq = tag_pair.find('=');
                if (eq != std::string::npos) {
                    point.tags[tag_pair.substr(0, eq)] = tag_pair.substr(eq + 1);
                }
            }
        } else {
            point.measurement = measurement_part;
        }

        std::string fields_part;
        std::getline(ss, fields_part, ' ');
        std::stringstream fields_ss(fields_part);
        std::string field_pair;
        while (std::getline(fields_ss, field_pair, ',')) {
            size_t eq = field_pair.find('=');
            if (eq != std::string::npos) {
                std::string key = field_pair.substr(0, eq);
                std::string value_str = field_pair.substr(eq + 1);
                double value = std::stod(value_str);
                point.fields.push_back({key, FieldType::FLOAT, value});
            }
        }

        std::string timestamp_str;
        if (std::getline(ss, timestamp_str)) {
            point.timestamp = std::stoll(timestamp_str);
        } else {
            point.timestamp = now_nanos();
        }

        return point;
    }

    std::string format_result_as_json(const QueryResult& result) {
        std::stringstream ss;
        ss << "{";
        ss << R"("results":[{"series":[)";

        for (size_t i = 0; i < result.series.size(); ++i) {
            if (i > 0) ss << ",";

            ss << "{";
            ss << R"("tags":{)";
            bool first_tag = true;
            for (const auto& [k, v] : result.series[i]) {
                if (!first_tag) ss << ",";
                ss << "\"" << k << "\":\"" << v << "\"";
                first_tag = false;
            }
            ss << "},";

            ss << R"("values":[)";
            for (size_t j = 0; j < result.data[i].size(); ++j) {
                if (j > 0) ss << ",";
                ss << "[" << result.data[i][j].first << "," << result.data[i][j].second << "]";
            }
            ss << "]}";
        }

        ss << "]}]}";
        return ss.str();
    }

    std::string trim(const std::string& s) {
        size_t start = s.find_first_not_of(" \t\n\r");
        size_t end = s.find_last_not_of(" \t\n\r");
        if (start == std::string::npos) return "";
        return s.substr(start, end - start + 1);
    }

    std::string url_decode(const std::string& s) {
        std::string res;
        for (size_t i = 0; i < s.size(); ++i) {
            if (s[i] == '%' && i + 2 < s.size()) {
                int value = std::stoi(s.substr(i + 1, 2), nullptr, 16);
                res += static_cast<char>(value);
                i += 2;
            } else if (s[i] == '+') {
                res += ' ';
            } else {
                res += s[i];
            }
        }
        return res;
    }

    int port_;
    std::atomic<bool> running_;
    std::thread server_thread_;
#ifdef _WIN32
    SOCKET server_socket_;
#else
    int server_socket_;
#endif
    std::shared_ptr<QueryEngine> query_engine_;
    std::shared_ptr<InvertedIndex> inverted_index_;
    std::shared_ptr<MemTable> memtable_;
    std::shared_ptr<IndexManager> index_manager_;
};

}

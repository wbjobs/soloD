#include "http/http_server.h"
#include <sstream>
#include <algorithm>
#include <cctype>

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#pragma comment(lib, "ws2_32.lib")
using ssize_t = SSIZE_T;
#else
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
#include <fcntl.h>
#endif

namespace timescale::http {

HttpResponse HttpResponse::ok(const std::string& content) {
    HttpResponse resp;
    resp.status_code = 200;
    resp.body = content;
    resp.headers["Content-Type"] = "application/json";
    return resp;
}

HttpResponse HttpResponse::bad_request(const std::string& message) {
    HttpResponse resp;
    resp.status_code = 400;
    resp.body = "{\"error\":\"" + message + "\"}";
    resp.headers["Content-Type"] = "application/json";
    return resp;
}

HttpResponse HttpResponse::not_found(const std::string& message) {
    HttpResponse resp;
    resp.status_code = 404;
    resp.body = "{\"error\":\"" + message + "\"}";
    resp.headers["Content-Type"] = "application/json";
    return resp;
}

HttpResponse HttpResponse::internal_error(const std::string& message) {
    HttpResponse resp;
    resp.status_code = 500;
    resp.body = "{\"error\":\"" + message + "\"}";
    resp.headers["Content-Type"] = "application/json";
    return resp;
}

void InfluxQLParser::trim(std::string& s) {
    s.erase(s.begin(), std::find_if(s.begin(), s.end(), [](int ch) {
        return !std::isspace(ch);
    }));
    s.erase(std::find_if(s.rbegin(), s.rend(), [](int ch) {
        return !std::isspace(ch);
    }).base(), s.end());
}

std::vector<std::string> InfluxQLParser::split(const std::string& s, char delimiter) {
    std::vector<std::string> tokens;
    std::string token;
    std::istringstream token_stream(s);
    while (std::getline(token_stream, token, delimiter)) {
        if (!token.empty()) {
            tokens.push_back(token);
        }
    }
    return tokens;
}

Timestamp InfluxQLParser::parse_duration(const std::string& duration) {
    if (duration.empty()) return 0;
    
    size_t i = 0;
    while (i < duration.size() && std::isdigit(duration[i])) {
        i++;
    }
    
    long value = std::stol(duration.substr(0, i));
    std::string unit = duration.substr(i);
    
    if (unit == "ns") return value;
    if (unit == "u" || unit == "us") return value * 1000LL;
    if (unit == "ms") return value * 1000000LL;
    if (unit == "s") return value * 1000000000LL;
    if (unit == "m") return value * 60LL * 1000000000LL;
    if (unit == "h") return value * 3600LL * 1000000000LL;
    if (unit == "d") return value * 86400LL * 1000000000LL;
    if (unit == "w") return value * 7LL * 86400LL * 1000000000LL;
    
    return 0;
}

InfluxQLParser::Query InfluxQLParser::parse(const std::string& query_string) {
    Query q;
    std::string query = query_string;
    trim(query);
    
    size_t select_pos = query.find("SELECT");
    if (select_pos == std::string::npos) {
        select_pos = query.find("select");
    }
    
    if (select_pos == std::string::npos) return q;
    
    size_t from_pos = query.find("FROM");
    if (from_pos == std::string::npos) {
        from_pos = query.find("from");
    }
    
    std::string select_clause = query.substr(select_pos + 6, from_pos - select_pos - 6);
    trim(select_clause);
    
    size_t where_pos = query.find("WHERE");
    if (where_pos == std::string::npos) {
        where_pos = query.find("where");
    }
    
    size_t from_end = (where_pos != std::string::npos) ? where_pos : query.size();
    std::string from_clause = query.substr(from_pos + 4, from_end - from_pos - 4);
    trim(from_clause);
    q.measurement = from_clause;
    
    std::vector<std::string> fields = split(select_clause, ',');
    for (auto& field : fields) {
        trim(field);
        
        std::string lower_field = field;
        std::transform(lower_field.begin(), lower_field.end(), lower_field.begin(), ::tolower);
        
        if (lower_field.find("sum(") != std::string::npos) {
            q.aggregation = query::VectorizedAggregator::AggFunc::SUM;
            q.is_aggregation = true;
            size_t start = lower_field.find("(") + 1;
            size_t end = lower_field.find(")");
            q.select_fields.push_back(field.substr(start, end - start));
        } else if (lower_field.find("mean(") != std::string::npos) {
            q.aggregation = query::VectorizedAggregator::AggFunc::MEAN;
            q.is_aggregation = true;
            size_t start = lower_field.find("(") + 1;
            size_t end = lower_field.find(")");
            q.select_fields.push_back(field.substr(start, end - start));
        } else if (lower_field.find("count(") != std::string::npos) {
            q.aggregation = query::VectorizedAggregator::AggFunc::COUNT;
            q.is_aggregation = true;
            size_t start = lower_field.find("(") + 1;
            size_t end = lower_field.find(")");
            q.select_fields.push_back(field.substr(start, end - start));
        } else if (lower_field.find("min(") != std::string::npos) {
            q.aggregation = query::VectorizedAggregator::AggFunc::MIN;
            q.is_aggregation = true;
            size_t start = lower_field.find("(") + 1;
            size_t end = lower_field.find(")");
            q.select_fields.push_back(field.substr(start, end - start));
        } else if (lower_field.find("max(") != std::string::npos) {
            q.aggregation = query::VectorizedAggregator::AggFunc::MAX;
            q.is_aggregation = true;
            size_t start = lower_field.find("(") + 1;
            size_t end = lower_field.find(")");
            q.select_fields.push_back(field.substr(start, end - start));
        } else {
            q.select_fields.push_back(field);
        }
    }
    
    if (where_pos != std::string::npos) {
        size_t group_pos = query.find("GROUP BY");
        if (group_pos == std::string::npos) {
            group_pos = query.find("group by");
        }
        
        size_t where_end = (group_pos != std::string::npos) ? group_pos : query.size();
        std::string where_clause = query.substr(where_pos + 5, where_end - where_pos - 5);
        trim(where_clause);
        
        std::vector<std::string> conditions = split(where_clause, ' ');
        for (size_t i = 0; i < conditions.size(); i++) {
            if (conditions[i] == "AND" || conditions[i] == "and") continue;
            
            if (conditions[i].find("time") != std::string::npos) {
                if (i + 2 < conditions.size()) {
                    bool is_ge = (conditions[i + 1] == ">=" || conditions[i + 1] == ">");
                    bool is_le = (conditions[i + 1] == "<=" || conditions[i + 1] == "<");
                    
                    if (is_ge) {
                        q.start_time = std::stoll(conditions[i + 2]);
                    } else if (is_le) {
                        q.end_time = std::stoll(conditions[i + 2]);
                    }
                }
            } else {
                if (i + 2 < conditions.size() && conditions[i + 1] == "=") {
                    std::string key = conditions[i];
                    std::string value = conditions[i + 2];
                    value.erase(std::remove(value.begin(), value.end(), '\''), value.end());
                    value.erase(std::remove(value.begin(), value.end(), '\"'), value.end());
                    q.where_tags[key] = value;
                    i += 2;
                }
            }
        }
        
        if (group_pos != std::string::npos) {
            std::string group_clause = query.substr(group_pos + 8);
            trim(group_clause);
            
            std::vector<std::string> group_items = split(group_clause, ',');
            for (auto& item : group_items) {
                trim(item);
                if (item.find("time") != std::string::npos) {
                    size_t start = item.find("(") + 1;
                    size_t end = item.find(")");
                    if (start != std::string::npos && end != std::string::npos) {
                        std::string duration = item.substr(start, end - start);
                        q.group_by_time = parse_duration(duration);
                    }
                } else {
                    q.group_by_tags.push_back(item);
                }
            }
        }
    }
    
    return q;
}

std::vector<Point> InfluxQLParser::parse_line_protocol(const std::string& data) {
    std::vector<Point> points;
    std::vector<std::string> lines = split(data, '\n');
    
    for (auto& line : lines) {
        trim(line);
        if (line.empty()) continue;
        
        Point point;
        
        size_t space1 = line.find(' ');
        if (space1 == std::string::npos) continue;
        
        std::string measurement_tags = line.substr(0, space1);
        size_t comma_pos = measurement_tags.find(',');
        
        if (comma_pos != std::string::npos) {
            point.measurement = measurement_tags.substr(0, comma_pos);
            std::string tags_str = measurement_tags.substr(comma_pos + 1);
            std::vector<std::string> tag_pairs = split(tags_str, ',');
            
            for (auto& tag_pair : tag_pairs) {
                size_t eq_pos = tag_pair.find('=');
                if (eq_pos != std::string::npos) {
                    point.tags[tag_pair.substr(0, eq_pos)] = tag_pair.substr(eq_pos + 1);
                }
            }
        } else {
            point.measurement = measurement_tags;
        }
        
        size_t space2 = line.find(' ', space1 + 1);
        std::string fields_str;
        
        if (space2 != std::string::npos) {
            fields_str = line.substr(space1 + 1, space2 - space1 - 1);
            point.timestamp = std::stoll(line.substr(space2 + 1));
        } else {
            fields_str = line.substr(space1 + 1);
            point.timestamp = now();
        }
        
        std::vector<std::string> field_pairs = split(fields_str, ',');
        for (auto& field_pair : field_pairs) {
            size_t eq_pos = field_pair.find('=');
            if (eq_pos != std::string::npos) {
                std::string key = field_pair.substr(0, eq_pos);
                std::string value_str = field_pair.substr(eq_pos + 1);
                
                if (value_str.back() == 'i') {
                    value_str.pop_back();
                }
                
                try {
                    point.fields[key] = std::stod(value_str);
                } catch (...) {}
            }
        }
        
        points.push_back(std::move(point));
    }
    
    return points;
}

HttpServer::HttpServer(int port, int num_threads)
    : port_(port), num_threads_(num_threads) {
    handlers_["/write"] = [this](const HttpRequest& req) { return handle_write(req); };
    handlers_["/query"] = [this](const HttpRequest& req) { return handle_query(req); };
    handlers_["/ping"] = [this](const HttpRequest& req) { return handle_ping(req); };
}

HttpServer::~HttpServer() {
    stop();
}

bool HttpServer::start() {
    running_ = true;
    
#ifdef _WIN32
    WSADATA wsaData;
    if (WSAStartup(MAKEWORD(2, 2), &wsaData) != 0) {
        return false;
    }
#endif
    
    int server_fd = socket(AF_INET, SOCK_STREAM, 0);
    if (server_fd < 0) return false;
    
    int opt = 1;
#ifdef _WIN32
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR, (char*)&opt, sizeof(opt));
#else
    setsockopt(server_fd, SOL_SOCKET, SO_REUSEADDR | SO_REUSEPORT, &opt, sizeof(opt));
#endif
    
    sockaddr_in address;
    address.sin_family = AF_INET;
    address.sin_addr.s_addr = INADDR_ANY;
    address.sin_port = htons(port_);
    
    if (bind(server_fd, (sockaddr*)&address, sizeof(address)) < 0) {
#ifdef _WIN32
        closesocket(server_fd);
#else
        close(server_fd);
#endif
        return false;
    }
    
    if (listen(server_fd, 1024) < 0) {
#ifdef _WIN32
        closesocket(server_fd);
#else
        close(server_fd);
#endif
        return false;
    }
    
    for (int i = 0; i < num_threads_; i++) {
        worker_threads_.emplace_back(&HttpServer::worker_thread, this);
    }
    
    accept_thread_ = std::thread([this, server_fd]() {
        while (running_) {
            sockaddr_in client_addr;
#ifdef _WIN32
            int addrlen = sizeof(client_addr);
#else
            socklen_t addrlen = sizeof(client_addr);
#endif
            
            int client_fd = accept(server_fd, (sockaddr*)&client_addr, &addrlen);
            if (client_fd >= 0) {
                std::lock_guard lock(queue_mutex_);
                connection_queue_.push(client_fd);
                queue_cv_.notify_one();
            }
        }
    });
    
    return true;
}

void HttpServer::stop() {
    running_ = false;
    queue_cv_.notify_all();
    
    if (accept_thread_.joinable()) {
        accept_thread_.join();
    }
    
    for (auto& t : worker_threads_) {
        if (t.joinable()) {
            t.join();
        }
    }
    
#ifdef _WIN32
    WSACleanup();
#endif
}

void HttpServer::worker_thread() {
    while (running_) {
        int client_fd = -1;
        
        {
            std::unique_lock lock(queue_mutex_);
            queue_cv_.wait(lock, [this]() {
                return !connection_queue_.empty() || !running_;
            });
            
            if (!running_ && connection_queue_.empty()) return;
            
            if (!connection_queue_.empty()) {
                client_fd = connection_queue_.front();
                connection_queue_.pop();
            }
        }
        
        if (client_fd < 0) continue;
        
        char buffer[4096] = {0};
        ssize_t valread = recv(client_fd, buffer, sizeof(buffer), 0);
        
        if (valread > 0) {
            std::string request_str(buffer, valread);
            
            HttpRequest req;
            size_t line_end = request_str.find("\r\n");
            if (line_end != std::string::npos) {
                std::string first_line = request_str.substr(0, line_end);
                std::vector<std::string> parts = split(first_line, ' ');
                
                if (parts.size() >= 2) {
                    req.method = parts[0];
                    
                    std::string full_path = parts[1];
                    size_t query_pos = full_path.find('?');
                    
                    if (query_pos != std::string::npos) {
                        req.path = full_path.substr(0, query_pos);
                        std::string query_str = full_path.substr(query_pos + 1);
                        std::vector<std::string> query_parts = split(query_str, '&');
                        
                        for (auto& qp : query_parts) {
                            size_t eq = qp.find('=');
                            if (eq != std::string::npos) {
                                req.query_params[qp.substr(0, eq)] = qp.substr(eq + 1);
                            }
                        }
                    } else {
                        req.path = full_path;
                    }
                }
            }
            
            size_t body_start = request_str.find("\r\n\r\n");
            if (body_start != std::string::npos) {
                req.body = request_str.substr(body_start + 4);
            }
            
            HttpResponse resp;
            
            auto handler_it = handlers_.find(req.path);
            if (handler_it != handlers_.end()) {
                resp = handler_it->second(req);
            } else {
                resp = HttpResponse::not_found();
            }
            
            std::ostringstream response_stream;
            response_stream << "HTTP/1.1 " << resp.status_code << " ";
            
            switch (resp.status_code) {
                case 200: response_stream << "OK"; break;
                case 400: response_stream << "Bad Request"; break;
                case 404: response_stream << "Not Found"; break;
                default: response_stream << "Internal Server Error"; break;
            }
            response_stream << "\r\n";
            
            for (const auto& [key, value] : resp.headers) {
                response_stream << key << ": " << value << "\r\n";
            }
            response_stream << "Content-Length: " << resp.body.size() << "\r\n";
            response_stream << "\r\n" << resp.body;
            
            std::string response_str = response_stream.str();
            send(client_fd, response_str.c_str(), response_str.size(), 0);
        }
        
#ifdef _WIN32
        closesocket(client_fd);
#else
        close(client_fd);
#endif
    }
}

HttpResponse HttpServer::handle_write(const HttpRequest& req) {
    if (!storage_ || !series_manager_) {
        return HttpResponse::internal_error("Storage not initialized");
    }
    
    try {
        std::vector<Point> points = InfluxQLParser::parse_line_protocol(req.body);
        for (auto& point : points) {
            series_manager_->get_or_create_series(point.measurement, point.tags);
            storage_->insert(point);
        }
        
        return HttpResponse::ok();
    } catch (...) {
        return HttpResponse::bad_request("Invalid line protocol");
    }
}

HttpResponse HttpServer::handle_query(const HttpRequest& req) {
    if (!storage_ || !series_manager_) {
        return HttpResponse::internal_error("Storage not initialized");
    }
    
    try {
        std::string query_str;
        auto qp_it = req.query_params.find("q");
        if (qp_it != req.query_params.end()) {
            query_str = qp_it->second;
        } else {
            query_str = req.body;
        }
        
        InfluxQLParser::Query q = InfluxQLParser::parse(query_str);
        return execute_query(q);
    } catch (...) {
        return HttpResponse::bad_request("Invalid query");
    }
}

HttpResponse HttpServer::handle_ping(const HttpRequest& req) {
    return HttpResponse::ok("{\"version\":\"1.0.0\"}");
}

HttpResponse HttpServer::execute_query(const InfluxQLParser::Query& q) {
    if (q.measurement.empty()) {
        return HttpResponse::bad_request("No measurement specified");
    }
    
    std::vector<SeriesID> series_ids;
    
    if (index_manager_) {
        series_ids = index_manager_->query_with_index(q.where_tags, q.start_time, q.end_time, *series_manager_);
    } else {
        series_ids = series_manager_->find_series(q.measurement, q.where_tags);
    }
    
    std::ostringstream result_stream;
    result_stream << "{\"results\":[{\"series\":[";
    
    bool first_series = true;
    
    for (SeriesID sid : series_ids) {
        std::vector<Point> points;
        storage_->query(sid, q.start_time, q.end_time, points);
        
        if (points.empty()) continue;
        
        const auto* series_info = series_manager_->get_series(sid);
        if (!series_info) continue;
        
        if (!first_series) result_stream << ",";
        first_series = false;
        
        result_stream << "{\"name\":\"" << series_info->measurement << "\",";
        result_stream << "\"tags\":{";
        
        bool first_tag = true;
        for (const auto& [k, v] : series_info->tags) {
            if (!first_tag) result_stream << ",";
            result_stream << "\"" << k << "\":\"" << v << "\"";
            first_tag = false;
        }
        
        result_stream << "},\"columns\":[\"time\"";
        for (const auto& field : q.select_fields) {
            result_stream << ",\"" << field << "\"";
        }
        result_stream << "],\"values\":[";
        
        if (q.is_aggregation) {
            query::VectorizedAggregator aggregator(q.aggregation);
            query::TimeSeriesBatch batch(points.size(), q.select_fields.size());
            
            for (const auto& point : points) {
                std::vector<double> vals;
                for (const auto& field : q.select_fields) {
                    auto it = point.fields.find(field);
                    if (it != point.fields.end()) {
                        vals.push_back(it->second);
                    } else {
                        vals.push_back(0.0);
                    }
                }
                batch.add(point.timestamp, vals);
            }
            
            aggregator.accumulate(batch, 0);
            
            result_stream << "[" << q.start_time << "," << aggregator.result() << "]";
        } else {
            bool first_point = true;
            for (const auto& point : points) {
                if (!first_point) result_stream << ",";
                first_point = false;
                
                result_stream << "[" << point.timestamp;
                for (const auto& field : q.select_fields) {
                    auto it = point.fields.find(field);
                    if (it != point.fields.end()) {
                        result_stream << "," << it->second;
                    } else {
                        result_stream << ",null";
                    }
                }
                result_stream << "]";
            }
        }
        
        result_stream << "]}";
    }
    
    result_stream << "]}]}";
    
    return HttpResponse::ok(result_stream.str());
}

}

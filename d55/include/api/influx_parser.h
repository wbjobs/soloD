#pragma once

#include "core/common.h"
#include <string>
#include <vector>
#include <map>
#include <regex>
#include <sstream>
#include <chrono>

namespace timescale {

class InfluxQLParser {
public:
    static Query parse(const std::string& query_str) {
        Query query;

        std::string q = to_lower(trim(query_str));

        auto select_match = regex_search(q, std::regex("select\\s+(.+?)\\s+from"));
        auto from_match = regex_search(q, std::regex("from\\s+[\"']?([\\w]+)[\"']?"));
        auto where_match = regex_search(q, std::regex("where\\s+(.+?)(?:\\s+group|\\s+order|$)"));
        auto group_match = regex_search(q, std::regex("group\\s+by\\s+(.+?)(?:\\s+order|$)"));

        std::smatch match;
        if (std::regex_search(query_str, match, std::regex("from\\s+[\"']?([\\w]+)[\"']?", std::regex::icase))) {
            query.measurement = match[1].str();
        }

        parse_select_clause(query_str, query);

        if (std::regex_search(query_str, match, std::regex("where\\s+(.+?)(?:\\s+group|\\s+order|$)", std::regex::icase))) {
            parse_where_clause(match[1].str(), query);
        }

        if (std::regex_search(query_str, match, std::regex("group\\s+by\\s+(.+?)(?:\\s+order|$)", std::regex::icase))) {
            parse_group_by_clause(match[1].str(), query);
        }

        if (query.start_time == 0) {
            query.start_time = now_nanos() - HOUR;
        }
        if (query.end_time == 0) {
            query.end_time = now_nanos();
        }

        return query;
    }

private:
    static void parse_select_clause(const std::string& query_str, Query& query) {
        std::smatch match;
        if (std::regex_search(query_str, match, std::regex("select\\s+(.+?)\\s+from", std::regex::icase))) {
            std::string select_part = match[1].str();
            std::vector<std::string> parts = split(select_part, ',');

            for (const auto& part : parts) {
                std::string p = trim(part);

                if (starts_with(p, "mean(")) {
                    query.aggregations.push_back({AggregationType::MEAN, extract_field(p)});
                } else if (starts_with(p, "sum(")) {
                    query.aggregations.push_back({AggregationType::SUM, extract_field(p)});
                } else if (starts_with(p, "min(")) {
                    query.aggregations.push_back({AggregationType::MIN, extract_field(p)});
                } else if (starts_with(p, "max(")) {
                    query.aggregations.push_back({AggregationType::MAX, extract_field(p)});
                } else if (starts_with(p, "count(")) {
                    query.aggregations.push_back({AggregationType::COUNT, extract_field(p)});
                } else {
                    query.aggregations.push_back({AggregationType::MEAN, p});
                }
            }
        }

        if (query.aggregations.empty()) {
            query.aggregations.push_back({AggregationType::MEAN, "value"});
        }
    }

    static void parse_where_clause(const std::string& where_str, Query& query) {
        std::vector<std::string> conditions = split(where_str, "and");

        for (const auto& cond : conditions) {
            std::string c = trim(cond);

            size_t eq_pos = c.find('=');
            if (eq_pos != std::string::npos && c.find("time") == std::string::npos) {
                std::string key = trim(c.substr(0, eq_pos));
                std::string value = trim(c.substr(eq_pos + 1));
                value = remove_quotes(value);
                query.tags[key] = value;
            }

            if (c.find("time") != std::string::npos) {
                parse_time_condition(c, query);
            }
        }
    }

    static void parse_group_by_clause(const std::string& group_str, Query& query) {
        std::vector<std::string> parts = split(group_str, ',');

        for (const auto& part : parts) {
            std::string p = trim(part);

            if (starts_with(p, "time(")) {
                query.group_by_time = parse_duration(p);
            } else {
                query.group_by.push_back(remove_quotes(p));
            }
        }
    }

    static void parse_time_condition(const std::string& cond, Query& query) {
        std::smatch match;

        if (std::regex_search(cond, match, std::regex(">\\s*(.+)", std::regex::icase))) {
            query.start_time = parse_time_value(match[1].str());
        }
        if (std::regex_search(cond, match, std::regex("<\\s*(.+)", std::regex::icase))) {
            query.end_time = parse_time_value(match[1].str());
        }
    }

    static Timestamp parse_time_value(const std::string& value) {
        std::string v = trim(value);
        v = remove_quotes(v);

        if (v == "now()") {
            return now_nanos();
        }

        if (ends_with(v, "s") || ends_with(v, "m") || ends_with(v, "h") ||
            ends_with(v, "d") || ends_with(v, "w")) {
            Timestamp duration = parse_duration(v);
            return now_nanos() - duration;
        }

        try {
            return std::stoll(v) * 1000000;
        } catch (...) {
            return now_nanos() - HOUR;
        }
    }

    static Timestamp parse_duration(const std::string& dur_str) {
        std::string d = remove_quotes(dur_str);
        if (starts_with(d, "time(")) {
            d = d.substr(5, d.size() - 6);
        }

        std::smatch match;
        if (std::regex_match(d, match, std::regex("(\\d+)([smhdw])"))) {
            int64_t value = std::stoll(match[1].str());
            std::string unit = match[2].str();

            if (unit == "s") return value * SECOND;
            if (unit == "m") return value * MINUTE;
            if (unit == "h") return value * HOUR;
            if (unit == "d") return value * DAY;
            if (unit == "w") return value * WEEK;
        }

        return 0;
    }

    static std::string extract_field(const std::string& func) {
        size_t start = func.find('(');
        size_t end = func.find(')');
        if (start != std::string::npos && end != std::string::npos) {
            return remove_quotes(trim(func.substr(start + 1, end - start - 1)));
        }
        return "value";
    }

    static std::string to_lower(const std::string& s) {
        std::string res = s;
        std::transform(res.begin(), res.end(), res.begin(), ::tolower);
        return res;
    }

    static std::string trim(const std::string& s) {
        size_t start = s.find_first_not_of(" \t\n\r");
        size_t end = s.find_last_not_of(" \t\n\r");
        if (start == std::string::npos) return "";
        return s.substr(start, end - start + 1);
    }

    static std::vector<std::string> split(const std::string& s, char delim) {
        std::vector<std::string> result;
        std::stringstream ss(s);
        std::string item;
        while (std::getline(ss, item, delim)) {
            result.push_back(item);
        }
        return result;
    }

    static bool starts_with(const std::string& s, const std::string& prefix) {
        return s.size() >= prefix.size() &&
               std::equal(prefix.begin(), prefix.end(), s.begin());
    }

    static bool ends_with(const std::string& s, const std::string& suffix) {
        return s.size() >= suffix.size() &&
               std::equal(suffix.rbegin(), suffix.rend(), s.rbegin());
    }

    static std::string remove_quotes(const std::string& s) {
        std::string res = s;
        if (!res.empty() && (res[0] == '"' || res[0] == '\'')) {
            res = res.substr(1);
        }
        if (!res.empty() && (res.back() == '"' || res.back() == '\'')) {
            res = res.substr(0, res.size() - 1);
        }
        return res;
    }
};

}

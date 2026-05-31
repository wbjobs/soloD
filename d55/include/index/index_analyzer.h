#pragma once

#include "core/common.h"
#include "index/query_log.h"
#include "index/index_recommendation.h"
#include <vector>
#include <string>
#include <map>
#include <unordered_map>
#include <memory>
#include <shared_mutex>
#include <algorithm>
#include <cmath>
#include <set>

namespace timescale {

class IndexAnalyzer {
public:
    IndexAnalyzer(size_t frequency_threshold = 10,
                   double min_improvement_threshold = 20.0)
        : frequency_threshold_(frequency_threshold),
          min_improvement_threshold_(min_improvement_threshold),
          total_series_estimate_(100000),
          avg_points_per_series_(1000) {}

    struct SeriesStats {
        std::string measurement;
        size_t total_series = 0;
        std::map<std::string, size_t> tag_cardinality;
        size_t avg_points_per_series = 0;
    };

    void update_series_stats(const SeriesStats& stats) {
        std::unique_lock lock(mutex_);
        series_stats_[stats.measurement] = stats;
        total_series_estimate_ = std::max(total_series_estimate_, stats.total_series);
        avg_points_per_series_ = std::max(avg_points_per_series_, stats.avg_points_per_series);
    }

    std::vector<IndexRecommendation> analyze_patterns(
        const std::vector<QueryLogEntry>& queries,
        const std::map<std::string, QueryLogger::PatternStats>& pattern_stats) {
        
        std::unique_lock lock(mutex_);
        std::vector<IndexRecommendation> recommendations;
        
        std::map<std::string, PatternAnalysis> combined_patterns;

        for (const auto& entry : queries) {
            PatternAnalysis analysis;
            analysis.measurement = entry.measurement;
            analysis.filter_tags = entry.filter_tags;
            analysis.group_by_tags = entry.group_by_tags;
            analysis.aggregate_fields = entry.aggregate_fields;
            analysis.total_execution_time += entry.execution_time_ns;
            analysis.query_count++;
            analysis.max_execution_time = std::max(analysis.max_execution_time, entry.execution_time_ns);
            analysis.scanned_points += entry.scanned_points;
            
            std::string key = get_pattern_key(entry);
            combined_patterns[key] = analysis;
        }

        for (const auto& [pattern_key, stats] : pattern_stats) {
            if (stats.count >= frequency_threshold_) {
                for (const auto& entry : queries) {
                    if (get_pattern_key(entry) == pattern_key) {
                        PatternAnalysis analysis;
                        analysis.measurement = entry.measurement;
                        analysis.filter_tags = entry.filter_tags;
                        analysis.group_by_tags = entry.group_by_tags;
                        analysis.aggregate_fields = entry.aggregate_fields;
                        analysis.total_execution_time = stats.total_time_ns;
                        analysis.query_count = stats.count;
                        analysis.max_execution_time = stats.max_time_ns;
                        
                        auto rec = generate_recommendation(analysis);
                        if (rec.estimated_improvement_pct >= min_improvement_threshold_) {
                            recommendations.push_back(rec);
                        }
                        break;
                    }
                }
            }
        }

        std::sort(recommendations.begin(), recommendations.end(),
            [](const auto& a, const auto& b) {
                return a.estimated_improvement_pct * a.frequency >
                       b.estimated_improvement_pct * b.frequency;
            });

        return recommendations;
    }

    IndexRecommendation generate_recommendation(const PatternAnalysis& analysis) {
        IndexRecommendation rec;
        rec.recommendation_id = "rec_" + std::to_string(now_nanos()) + "_" + 
                                std::to_string(rand() % 10000);
        rec.measurement = analysis.measurement;
        rec.filter_tags = analysis.filter_tags;
        rec.group_by_tags = analysis.group_by_tags;
        rec.aggregate_fields = analysis.aggregate_fields;
        rec.frequency = analysis.query_count;
        rec.created_at = now_nanos();
        rec.updated_at = now_nanos();
        rec.status = RecommendationStatus::PENDING;
        rec.use_count = 0;
        rec.last_used = 0;

        if (!analysis.group_by_tags.empty() || !analysis.aggregate_fields.empty()) {
            rec.type = RecommendationType::MATERIALIZED_VIEW;
        } else {
            rec.type = RecommendationType::COMPOSITE_INDEX;
        }

        estimate_performance(analysis, rec);
        estimate_storage(analysis, rec);
        estimate_build_time(analysis, rec);

        return rec;
    }

    void estimate_performance(const PatternAnalysis& analysis, IndexRecommendation& rec) {
        double filter_ratio = 1.0;
        auto it = series_stats_.find(analysis.measurement);
        if (it != series_stats_.end()) {
            for (const auto& tag : analysis.filter_tags) {
                auto card_it = it->second.tag_cardinality.find(tag);
                if (card_it != it->second.tag_cardinality.end()) {
                    filter_ratio *= 1.0 / std::max(1ULL, card_it->second);
                }
            }
        }

        filter_ratio = std::max(0.0001, filter_ratio);
        double current_scan_ratio = 1.0;
        double improvement = (1.0 - filter_ratio) * 100.0;

        if (rec.type == RecommendationType::MATERIALIZED_VIEW) {
            improvement = std::min(99.0, improvement * 1.5);
        }

        rec.estimated_improvement_pct = improvement;
    }

    void estimate_storage(const PatternAnalysis& analysis, IndexRecommendation& rec) {
        size_t series_count = total_series_estimate_;
        auto it = series_stats_.find(analysis.measurement);
        if (it != series_stats_.end()) {
            series_count = it->second.total_series;
        }

        for (const auto& tag : analysis.filter_tags) {
            series_count = static_cast<size_t>(series_count * 0.1);
        }

        size_t points_per_entry = 10;
        size_t point_size_bytes = 32;

        if (rec.type == RecommendationType::MATERIALIZED_VIEW) {
            size_t time_buckets = 24 * 30;
            rec.estimated_storage_bytes = series_count * time_buckets * 
                                           analysis.aggregate_fields.size() * point_size_bytes;
        } else {
            rec.estimated_storage_bytes = series_count * points_per_entry * point_size_bytes;
        }
    }

    void estimate_build_time(const PatternAnalysis& analysis, IndexRecommendation& rec) {
        size_t total_records = total_series_estimate_ * avg_points_per_series_;
        double build_rate = 100000.0;
        rec.estimated_build_time_seconds = total_records / build_rate;
    }

private:
    struct PatternAnalysis {
        std::string measurement;
        std::vector<std::string> filter_tags;
        std::vector<std::string> group_by_tags;
        std::vector<std::string> aggregate_fields;
        int64_t total_execution_time = 0;
        size_t query_count = 0;
        int64_t max_execution_time = 0;
        size_t scanned_points = 0;
    };

    std::string get_pattern_key(const QueryLogEntry& entry) const {
        std::string key = entry.measurement;
        auto tags = entry.filter_tags;
        std::sort(tags.begin(), tags.end());
        for (const auto& tag : tags) {
            key += "|F:" + tag;
        }

        auto group_tags = entry.group_by_tags;
        std::sort(group_tags.begin(), group_tags.end());
        for (const auto& tag : group_tags) {
            key += "|G:" + tag;
        }

        return key;
    }

    size_t frequency_threshold_;
    double min_improvement_threshold_;
    size_t total_series_estimate_;
    size_t avg_points_per_series_;
    mutable std::shared_mutex mutex_;
    std::map<std::string, SeriesStats> series_stats_;
};

}

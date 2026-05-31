#pragma once

#include "core/common.h"
#include "index/query_log.h"
#include <vector>
#include <string>
#include <map>
#include <memory>
#include <shared_mutex>
#include <atomic>
#include <chrono>

namespace timescale {

enum class RecommendationType {
    COMPOSITE_INDEX,
    MATERIALIZED_VIEW
};

enum class RecommendationStatus {
    PENDING,
    APPROVED,
    REJECTED,
    BUILDING,
    COMPLETED,
    FAILED,
    OBSOLETE
};

struct IndexRecommendation {
    std::string recommendation_id;
    RecommendationType type;
    std::string measurement;
    std::vector<std::string> filter_tags;
    std::vector<std::string> group_by_tags;
    std::vector<std::string> aggregate_fields;
    
    size_t frequency;
    double estimated_improvement_pct;
    size_t estimated_storage_bytes;
    double estimated_build_time_seconds;
    
    RecommendationStatus status;
    Timestamp created_at;
    Timestamp updated_at;
    Timestamp last_used;
    size_t use_count;
    size_t unused_days;
    
    std::string error_message;
    std::string index_name;

    std::string get_key() const {
        std::string key = measurement;
        for (const auto& tag : filter_tags) key += "|F:" + tag;
        for (const auto& tag : group_by_tags) key += "|G:" + tag;
        for (const auto& field : aggregate_fields) key += "|A:" + field;
        return key;
    }
};

struct IndexBuildProgress {
    std::string recommendation_id;
    size_t total_series;
    size_t processed_series;
    size_t total_entries;
    size_t processed_entries;
    Timestamp start_time;
    double current_speed_entries_per_sec;
};

class RecommendationStore {
public:
    RecommendationStore(size_t max_recommendations = 1000)
        : max_recommendations_(max_recommendations) {}

    void add_recommendation(const IndexRecommendation& rec) {
        std::unique_lock lock(mutex_);
        
        std::string key = rec.get_key();
        auto it = recommendations_.find(key);
        if (it != recommendations_.end()) {
            if (it->second.status == RecommendationStatus::PENDING) {
                it->second.frequency = std::max(it->second.frequency, rec.frequency);
                it->second.updated_at = rec.updated_at;
                return;
            }
        }

        recommendations_[key] = rec;
        recommendation_ids_[rec.recommendation_id] = key;

        if (recommendations_.size() > max_recommendations_) {
            evict_oldest();
        }
    }

    bool update_status(const std::string& recommendation_id, RecommendationStatus new_status,
                        const std::string& error = "") {
        std::unique_lock lock(mutex_);
        
        auto it = recommendation_ids_.find(recommendation_id);
        if (it == recommendation_ids_.end()) {
            return false;
        }

        auto& rec = recommendations_[it->second];
        rec.status = new_status;
        rec.updated_at = now_nanos();
        if (!error.empty()) {
            rec.error_message = error;
        }
        return true;
    }

    void record_index_use(const std::string& index_name) {
        std::unique_lock lock(mutex_);
        for (auto& [key, rec] : recommendations_) {
            if (rec.index_name == index_name && rec.status == RecommendationStatus::COMPLETED) {
                rec.last_used = now_nanos();
                rec.use_count++;
                break;
            }
        }
    }

    std::vector<IndexRecommendation> get_all_recommendations(
        RecommendationStatus filter = static_cast<RecommendationStatus>(-1)) const {
        std::shared_lock lock(mutex_);
        std::vector<IndexRecommendation> result;
        
        for (const auto& [key, rec] : recommendations_) {
            if (static_cast<int>(filter) == -1 || rec.status == filter) {
                result.push_back(rec);
            }
        }
        
        std::sort(result.begin(), result.end(),
            [](const auto& a, const auto& b) { return b.frequency < a.frequency; });
        
        return result;
    }

    std::shared_ptr<IndexRecommendation> get_recommendation(const std::string& recommendation_id) {
        std::shared_lock lock(mutex_);
        auto it = recommendation_ids_.find(recommendation_id);
        if (it == recommendation_ids_.end()) {
            return nullptr;
        }
        return std::make_shared<IndexRecommendation>(recommendations_[it->second]);
    }

    std::vector<IndexRecommendation> get_unused_indices(int min_unused_days = 7) const {
        std::shared_lock lock(mutex_);
        std::vector<IndexRecommendation> result;
        Timestamp now = now_nanos();
        
        for (const auto& [key, rec] : recommendations_) {
            if (rec.status == RecommendationStatus::COMPLETED) {
                Timestamp last_use = rec.last_used > 0 ? rec.last_used : rec.updated_at;
                int days_unused = static_cast<int>((now - last_use) / DAY);
                if (days_unused >= min_unused_days) {
                    result.push_back(rec);
                }
            }
        }
        return result;
    }

    bool delete_recommendation(const std::string& recommendation_id) {
        std::unique_lock lock(mutex_);
        auto it = recommendation_ids_.find(recommendation_id);
        if (it == recommendation_ids_.end()) {
            return false;
        }
        recommendations_.erase(it->second);
        recommendation_ids_.erase(it);
        return true;
    }

    void set_build_progress(const IndexBuildProgress& progress) {
        std::unique_lock lock(mutex_);
        build_progress_[progress.recommendation_id] = progress;
    }

    IndexBuildProgress get_build_progress(const std::string& recommendation_id) const {
        std::shared_lock lock(mutex_);
        auto it = build_progress_.find(recommendation_id);
        if (it != build_progress_.end()) {
            return it->second;
        }
        return IndexBuildProgress{};
    }

    size_t size() const {
        std::shared_lock lock(mutex_);
        return recommendations_.size();
    }

private:
    void evict_oldest() {
        std::vector<std::pair<Timestamp, std::string>> candidates;
        for (const auto& [key, rec] : recommendations_) {
            if (rec.status == RecommendationStatus::PENDING ||
                rec.status == RecommendationStatus::REJECTED ||
                rec.status == RecommendationStatus::OBSOLETE) {
                candidates.emplace_back(rec.updated_at, key);
            }
        }
        
        std::sort(candidates.begin(), candidates.end());
        
        for (size_t i = 0; i < std::min<size_t>(10, candidates.size()); ++i) {
            recommendation_ids_.erase(recommendations_[candidates[i].second].recommendation_id);
            recommendations_.erase(candidates[i].second);
        }
    }

    size_t max_recommendations_;
    mutable std::shared_mutex mutex_;
    std::map<std::string, IndexRecommendation> recommendations_;
    std::unordered_map<std::string, std::string> recommendation_ids_;
    std::unordered_map<std::string, IndexBuildProgress> build_progress_;
};

}

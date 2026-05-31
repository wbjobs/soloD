#pragma once

#include "core/common.h"
#include "index/query_log.h"
#include "index/index_analyzer.h"
#include "index/index_recommendation.h"
#include <memory>
#include <thread>
#include <atomic>
#include <queue>
#include <functional>
#include <mutex>
#include <condition_variable>

namespace timescale {

class IndexManager {
public:
    using IndexBuildCallback = std::function<void(const IndexRecommendation&, bool)>;

    IndexManager(std::shared_ptr<QueryLogger> logger,
                  std::shared_ptr<RecommendationStore> store,
                  std::shared_ptr<IndexAnalyzer> analyzer,
                  int analysis_interval_minutes = 10,
                  int unused_index_cleanup_days = 7)
        : query_logger_(logger),
          recommendation_store_(store),
          analyzer_(analyzer),
          analysis_interval_ms_(analysis_interval_minutes * 60 * 1000),
          unused_index_threshold_days_(unused_index_cleanup_days),
          running_(false),
          auto_approve_(false) {}

    ~IndexManager() {
        stop();
    }

    void start() {
        running_ = true;
        analysis_thread_ = std::thread(&IndexManager::analysis_loop, this);
        build_thread_ = std::thread(&IndexManager::build_loop, this);
        cleanup_thread_ = std::thread(&IndexManager::cleanup_loop, this);
    }

    void stop() {
        running_ = false;
        cv_.notify_all();
        build_cv_.notify_all();

        if (analysis_thread_.joinable()) {
            analysis_thread_.join();
        }
        if (build_thread_.joinable()) {
            build_thread_.join();
        }
        if (cleanup_thread_.joinable()) {
            cleanup_thread_.join();
        }
    }

    void set_auto_approve(bool enable) {
        auto_approve_ = enable;
    }

    bool approve_recommendation(const std::string& recommendation_id) {
        auto rec = recommendation_store_->get_recommendation(recommendation_id);
        if (!rec || rec->status != RecommendationStatus::PENDING) {
            return false;
        }

        recommendation_store_->update_status(recommendation_id, RecommendationStatus::APPROVED);
        {
            std::unique_lock lock(build_mutex_);
            build_queue_.push(recommendation_id);
        }
        build_cv_.notify_one();
        return true;
    }

    bool reject_recommendation(const std::string& recommendation_id) {
        return recommendation_store_->update_status(
            recommendation_id, RecommendationStatus::REJECTED);
    }

    void trigger_analysis() {
        cv_.notify_one();
    }

    std::vector<IndexRecommendation> get_recommendations(RecommendationStatus status =
        static_cast<RecommendationStatus>(-1)) const {
        return recommendation_store_->get_all_recommendations(status);
    }

    IndexBuildProgress get_build_progress(const std::string& recommendation_id) const {
        return recommendation_store_->get_build_progress(recommendation_id);
    }

    void set_index_build_callback(IndexBuildCallback callback) {
        build_callback_ = std::move(callback);
    }

    size_t get_build_queue_size() const {
        std::shared_lock lock(build_mutex_);
        return build_queue_.size();
    }

private:
    void analysis_loop() {
        while (running_) {
            std::unique_lock lock(mutex_);
            cv_.wait_for(lock, std::chrono::milliseconds(analysis_interval_ms_),
                [this] { return !running_; });

            if (!running_) break;

            perform_analysis();
        }
    }

    void perform_analysis() {
        auto slow_queries = query_logger_->get_slow_queries();
        auto pattern_stats = query_logger_->get_pattern_stats();

        auto recommendations = analyzer_->analyze_patterns(slow_queries, pattern_stats);

        for (auto& rec : recommendations) {
            recommendation_store_->add_recommendation(rec);

            if (auto_approve_ && rec.status == RecommendationStatus::PENDING) {
                approve_recommendation(rec.recommendation_id);
            }
        }
    }

    void build_loop() {
        while (running_) {
            std::string rec_id;
            {
                std::unique_lock lock(build_mutex_);
                build_cv_.wait(lock, [this] {
                    return !running_ || !build_queue_.empty();
                });

                if (!running_) break;
                if (build_queue_.empty()) continue;

                rec_id = build_queue_.front();
                build_queue_.pop();
            }

            build_index(rec_id);
        }
    }

    void build_index(const std::string& recommendation_id) {
        auto rec = recommendation_store_->get_recommendation(recommendation_id);
        if (!rec) return;

        recommendation_store_->update_status(recommendation_id, RecommendationStatus::BUILDING);

        IndexBuildProgress progress;
        progress.recommendation_id = recommendation_id;
        progress.start_time = now_nanos();
        progress.total_series = 10000;
        progress.total_entries = progress.total_series * 100;

        recommendation_store_->set_build_progress(progress);

        bool success = simulate_build_process(progress);

        if (success) {
            rec->index_name = generate_index_name(*rec);
            recommendation_store_->add_recommendation(*rec);
            recommendation_store_->update_status(recommendation_id,
                RecommendationStatus::COMPLETED);
        } else {
            recommendation_store_->update_status(recommendation_id,
                RecommendationStatus::FAILED, "Build process encountered an error");
        }

        if (build_callback_) {
            build_callback_(*rec, success);
        }
    }

    bool simulate_build_process(IndexBuildProgress& progress) {
        const size_t batch_size = 1000;
        size_t total_batches = progress.total_entries / batch_size;

        for (size_t i = 0; i < total_batches && running_; ++i) {
            std::this_thread::sleep_for(std::chrono::milliseconds(10));

            progress.processed_entries = (i + 1) * batch_size;
            progress.processed_series = (progress.processed_entries / 100);
            progress.current_speed_entries_per_sec = batch_size * 100;

            recommendation_store_->set_build_progress(progress);
        }

        return true;
    }

    void cleanup_loop() {
        while (running_) {
            std::this_thread::sleep_for(std::chrono::hours(24));
            if (!running_) break;

            auto unused_indices = recommendation_store_->get_unused_indices(
                unused_index_threshold_days_);

            for (const auto& rec : unused_indices) {
                recommendation_store_->update_status(rec.recommendation_id,
                    RecommendationStatus::OBSOLETE);
            }
        }
    }

    std::string generate_index_name(const IndexRecommendation& rec) const {
        std::string name = "idx_";
        if (rec.type == RecommendationType::MATERIALIZED_VIEW) {
            name = "mv_";
        }
        name += rec.measurement;
        for (const auto& tag : rec.filter_tags) {
            name += "_" + tag;
        }
        return name;
    }

    std::shared_ptr<QueryLogger> query_logger_;
    std::shared_ptr<RecommendationStore> recommendation_store_;
    std::shared_ptr<IndexAnalyzer> analyzer_;

    int analysis_interval_ms_;
    int unused_index_threshold_days_;
    std::atomic<bool> running_;
    std::atomic<bool> auto_approve_;

    std::thread analysis_thread_;
    std::thread build_thread_;
    std::thread cleanup_thread_;

    mutable std::mutex mutex_;
    std::condition_variable cv_;

    mutable std::mutex build_mutex_;
    std::condition_variable build_cv_;
    std::queue<std::string> build_queue_;

    IndexBuildCallback build_callback_;
};

}

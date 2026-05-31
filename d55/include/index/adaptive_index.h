#pragma once

#include "core/common.h"
#include "index/bloom_filter.h"
#include "index/skip_list.h"
#include <shared_mutex>
#include <queue>

namespace timescale {

struct TagCombination {
    std::vector<std::string> tags;

    bool operator<(const TagCombination& other) const {
        if (tags.size() != other.tags.size()) {
            return tags.size() < other.tags.size();
        }
        for (size_t i = 0; i < tags.size(); ++i) {
            if (tags[i] != other.tags[i]) {
                return tags[i] < other.tags[i];
            }
        }
        return false;
    }
};

struct CombinationIndex {
    TagCombination combination;
    BloomFilter bloom_filter;
    SkipList<std::string, std::vector<SeriesID>> skip_list;
    size_t access_count;
    Timestamp last_access;

    CombinationIndex(const TagCombination& comb, size_t expected_entries)
        : combination(comb),
          bloom_filter(expected_entries),
          access_count(0),
          last_access(now_nanos()) {}
};

class AdaptiveIndexManager {
public:
    AdaptiveIndexManager(size_t max_combinations = 100)
        : max_combinations_(max_combinations),
          query_threshold_(5) {}

    void record_query(const std::string& measurement,
                      const std::map<std::string, TagValue>& tags) {
        std::unique_lock lock(mutex_);

        std::vector<std::string> tag_keys;
        for (const auto& [k, v] : tags) {
            tag_keys.push_back(k);
        }
        std::sort(tag_keys.begin(), tag_keys.end());

        TagCombination comb{tag_keys};
        query_counts_[comb]++;

        if (query_counts_[comb] >= query_threshold_ &&
            combination_indexes_.find(comb) == combination_indexes_.end()) {
            build_combination_index(comb);
        }
    }

    std::vector<SeriesID> query_with_index(const std::string& measurement,
                                            const std::map<std::string, TagValue>& tags) {
        std::vector<std::string> tag_keys;
        std::string key_str;
        for (const auto& [k, v] : tags) {
            tag_keys.push_back(k);
            key_str += k + "=" + v + "|";
        }
        std::sort(tag_keys.begin(), tag_keys.end());

        TagCombination comb{tag_keys};

        {
            std::shared_lock lock(mutex_);
            auto it = combination_indexes_.find(comb);
            if (it != combination_indexes_.end()) {
                it->second->access_count++;
                it->second->last_access = now_nanos();

                if (!it->second->bloom_filter.might_contain(hash_string(key_str))) {
                    return {};
                }

                std::vector<SeriesID> result;
                if (it->second->skip_list.find(key_str, result)) {
                    return result;
                }
            }
        }

        return {};
    }

    void add_series_to_indexes(SeriesID series_id,
                                const std::map<std::string, TagValue>& tags) {
        std::shared_lock lock(mutex_);

        for (const auto& [comb, index_ptr] : combination_indexes_) {
            std::string key_str;
            bool has_all_tags = true;
            for (const auto& tag : comb.tags) {
                auto it = tags.find(tag);
                if (it == tags.end()) {
                    has_all_tags = false;
                    break;
                }
                key_str += tag + "=" + it->second + "|";
            }

            if (has_all_tags) {
                index_ptr->bloom_filter.insert(series_id);
                std::vector<SeriesID> existing;
                if (index_ptr->skip_list.find(key_str, existing)) {
                    existing.push_back(series_id);
                    index_ptr->skip_list.insert(key_str, existing);
                } else {
                    index_ptr->skip_list.insert(key_str, {series_id});
                }
            }
        }
    }

    void evict_lru() {
        std::unique_lock lock(mutex_);

        while (combination_indexes_.size() > max_combinations_) {
            auto oldest = combination_indexes_.begin();
            Timestamp oldest_time = INT64_MAX;

            for (auto it = combination_indexes_.begin();
                 it != combination_indexes_.end(); ++it) {
                if (it->second->last_access < oldest_time) {
                    oldest = it;
                    oldest_time = it->second->last_access;
                }
            }

            if (oldest != combination_indexes_.end()) {
                query_counts_.erase(oldest->first);
                combination_indexes_.erase(oldest);
            }
        }
    }

private:
    void build_combination_index(const TagCombination& comb) {
        auto index_ptr = std::make_shared<CombinationIndex>(comb, 10000);
        combination_indexes_[comb] = index_ptr;
        evict_lru();
    }

    size_t max_combinations_;
    size_t query_threshold_;
    mutable std::shared_mutex mutex_;
    std::map<TagCombination, size_t> query_counts_;
    std::map<TagCombination, std::shared_ptr<CombinationIndex>> combination_indexes_;
};

}

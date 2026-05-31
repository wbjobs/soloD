#include "storage/lsm_tree.h"
#include <filesystem>
#include <sstream>
#include <functional>

namespace timescale::storage {

LSMTree::LSMTree(const LSMTreeConfig& config) : config_(config) {
    active_memtable_ = std::make_unique<MemTable>();
    levels_.resize(config_.level_count);
    
    std::filesystem::create_directories(config_.data_path);
    wal_ = std::make_unique<WAL>(config_.data_path + "/wal.log");
}

LSMTree::~LSMTree() {
    stop();
}

SeriesID LSMTree::get_series_id(const std::string& measurement, const TagMap& tags) const {
    std::string key = measurement;
    for (const auto& [k, v] : tags) {
        key += "|" + k + "=" + v;
    }
    return std::hash<std::string>{}(key);
}

bool LSMTree::insert(const Point& point) {
    wal_->append(point);
    
    SeriesID series_id = get_series_id(point.measurement, point.tags);
    
    {
        std::unique_lock lock(memtable_mutex_);
        active_memtable_->insert(series_id, point);
        
        if (active_memtable_->should_flush(config_.memtable_size_threshold)) {
            immutable_memtable_ = std::move(active_memtable_);
            active_memtable_ = std::make_unique<MemTable>();
            
            std::lock_guard flush_lock(flush_mutex_);
            need_flush_ = true;
            flush_cv_.notify_one();
        }
    }
    
    return true;
}

bool LSMTree::insert_batch(const std::vector<Point>& points) {
    for (const auto& point : points) {
        insert(point);
    }
    return true;
}

bool LSMTree::query(SeriesID series_id, Timestamp start, Timestamp end,
                    std::vector<Point>& results) const {
    {
        std::shared_lock lock(memtable_mutex_);
        
        for (const auto& memtable : {active_memtable_.get(), immutable_memtable_.get()}) {
            if (!memtable) continue;
            
            const auto& data = memtable->data();
            auto it = data.find(series_id);
            if (it != data.end()) {
                for (const auto& entry : it->second) {
                    if (entry.timestamp >= start && entry.timestamp <= end) {
                        Point point;
                        point.timestamp = entry.timestamp;
                        point.fields = entry.fields;
                        results.push_back(std::move(point));
                    }
                }
            }
        }
    }
    
    {
        std::shared_lock lock(levels_mutex_);
        
        for (const auto& level : levels_) {
            for (const auto& sstable : level) {
                if (sstable->max_time() < start || sstable->min_time() > end) {
                    continue;
                }
                
                std::vector<SSTableEntry> entries;
                sstable->read(series_id, start, end, entries);
                
                for (const auto& entry : entries) {
                    Point point;
                    point.timestamp = entry.timestamp;
                    point.fields = entry.fields;
                    results.push_back(std::move(point));
                }
            }
        }
    }
    
    std::sort(results.begin(), results.end(),
        [](const Point& a, const Point& b) {
            return a.timestamp < b.timestamp;
        });
    
    return true;
}

bool LSMTree::start() {
    running_ = true;
    recover();
    
    flush_thread_ = std::thread(&LSMTree::flush_thread_func, this);
    compaction_thread_ = std::thread(&LSMTree::compaction_thread_func, this);
    
    return true;
}

bool LSMTree::stop() {
    running_ = false;
    flush_cv_.notify_all();
    
    if (flush_thread_.joinable()) {
        flush_thread_.join();
    }
    if (compaction_thread_.joinable()) {
        compaction_thread_.join();
    }
    
    if (immutable_memtable_ && immutable_memtable_->entry_count() > 0) {
        flush_memtable();
    }
    
    return true;
}

size_t LSMTree::memtable_count() const {
    std::shared_lock lock(memtable_mutex_);
    return active_memtable_->entry_count() + 
           (immutable_memtable_ ? immutable_memtable_->entry_count() : 0);
}

size_t LSMTree::sstable_count(size_t level) const {
    std::shared_lock lock(levels_mutex_);
    if (level >= levels_.size()) return 0;
    return levels_[level].size();
}

void LSMTree::flush_thread_func() {
    while (running_) {
        std::unique_lock lock(flush_mutex_);
        flush_cv_.wait(lock, [this] { return need_flush_ || !running_; });
        
        if (!running_) break;
        
        if (need_flush_ && immutable_memtable_) {
            flush_memtable();
            need_flush_ = false;
        }
    }
}

bool LSMTree::flush_memtable() {
    if (!immutable_memtable_) return false;
    
    std::vector<SSTableEntry> entries;
    for (const auto& [series_id, mem_entries] : immutable_memtable_->data()) {
        for (const auto& mem_entry : mem_entries) {
            SSTableEntry entry;
            entry.series_id = series_id;
            entry.timestamp = mem_entry.timestamp;
            entry.fields = mem_entry.fields;
            entries.push_back(std::move(entry));
        }
    }
    
    if (entries.empty()) {
        immutable_memtable_.reset();
        return true;
    }
    
    std::ostringstream oss;
    oss << config_.data_path << "/sstable_l0_" << now() << ".dat";
    std::string sstable_path = oss.str();
    
    auto sstable = std::make_unique<SSTable>(sstable_path);
    if (!sstable->write(entries)) {
        return false;
    }
    
    {
        std::unique_lock lock(levels_mutex_);
        levels_[0].push_back(std::move(sstable));
    }
    
    wal_->truncate();
    immutable_memtable_.reset();
    
    return true;
}

void LSMTree::compaction_thread_func() {
    while (running_) {
        {
            std::shared_lock lock(levels_mutex_);
            for (size_t i = 0; i < levels_.size() - 1; ++i) {
                size_t threshold = config_.level0_sstable_count * (1 << i);
                if (levels_[i].size() >= threshold) {
                    compact_level(i);
                    break;
                }
            }
        }
        
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
}

bool LSMTree::compact_level(size_t level) {
    return true;
}

bool LSMTree::recover() {
    std::vector<Point> points;
    if (wal_->recover(points)) {
        insert_batch(points);
    }
    return true;
}

}

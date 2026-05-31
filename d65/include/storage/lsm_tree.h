#pragma once

#include "common/common.h"
#include "storage/memtable.h"
#include "storage/sstable.h"
#include "storage/wal.h"
#include <vector>
#include <memory>
#include <thread>
#include <atomic>
#include <queue>
#include <condition_variable>

namespace timescale::storage {

struct LSMTreeConfig {
    size_t memtable_size_threshold = 128 * 1024 * 1024;
    size_t level_count = 4;
    size_t level0_sstable_count = 4;
    std::string data_path = "./data";
};

class LSMTree {
public:
    explicit LSMTree(const LSMTreeConfig& config = LSMTreeConfig());
    ~LSMTree();

    bool insert(const Point& point);
    bool insert_batch(const std::vector<Point>& points);
    
    bool query(SeriesID series_id, Timestamp start, Timestamp end,
               std::vector<Point>& results) const;
    
    bool start();
    bool stop();
    
    size_t memtable_count() const;
    size_t sstable_count(size_t level) const;

private:
    void flush_thread_func();
    void compaction_thread_func();
    bool flush_memtable();
    bool compact_level(size_t level);
    bool recover();
    SeriesID get_series_id(const std::string& measurement, const TagMap& tags) const;

    LSMTreeConfig config_;
    
    std::unique_ptr<MemTable> active_memtable_;
    std::unique_ptr<MemTable> immutable_memtable_;
    std::unique_ptr<WAL> wal_;
    
    std::vector<std::vector<std::unique_ptr<SSTable>>> levels_;
    
    std::thread flush_thread_;
    std::thread compaction_thread_;
    std::atomic<bool> running_{false};
    
    mutable std::shared_mutex memtable_mutex_;
    mutable std::shared_mutex levels_mutex_;
    
    std::condition_variable flush_cv_;
    std::mutex flush_mutex_;
    bool need_flush_ = false;
};

}

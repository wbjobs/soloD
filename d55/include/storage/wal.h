#pragma once

#include "core/common.h"
#include <fstream>
#include <filesystem>

namespace timescale {

class WAL {
public:
    WAL(const std::string& path) : path_(path), position_(0) {
        file_.open(path, std::ios::binary | std::ios::app | std::ios::in);
        if (!file_.is_open()) {
            file_.open(path, std::ios::binary | std::ios::out | std::ios::trunc);
            file_.close();
            file_.open(path, std::ios::binary | std::ios::app | std::ios::in);
        }
    }

    ~WAL() {
        if (file_.is_open()) {
            file_.flush();
            file_.close();
        }
    }

    void append(SeriesID series_id, Timestamp timestamp, const std::vector<FieldValue>& values) {
        std::unique_lock lock(mutex_);
        file_.write(reinterpret_cast<const char*>(&series_id), sizeof(series_id));
        file_.write(reinterpret_cast<const char*>(&timestamp), sizeof(timestamp));
        size_t value_count = values.size();
        file_.write(reinterpret_cast<const char*>(&value_count), sizeof(value_count));
        for (auto v : values) {
            file_.write(reinterpret_cast<const char*>(&v), sizeof(v));
        }
        file_.flush();
    }

    std::vector<std::tuple<SeriesID, Timestamp, std::vector<FieldValue>>> recover() {
        std::unique_lock lock(mutex_);
        file_.seekg(0);
        std::vector<std::tuple<SeriesID, Timestamp, std::vector<FieldValue>>> result;

        while (file_.peek() != EOF) {
            SeriesID series_id;
            Timestamp timestamp;
            size_t value_count;

            file_.read(reinterpret_cast<char*>(&series_id), sizeof(series_id));
            file_.read(reinterpret_cast<char*>(&timestamp), sizeof(timestamp));
            file_.read(reinterpret_cast<char*>(&value_count), sizeof(value_count));

            std::vector<FieldValue> values(value_count);
            for (size_t i = 0; i < value_count; ++i) {
                file_.read(reinterpret_cast<char*>(&values[i]), sizeof(values[i]));
            }

            result.emplace_back(series_id, timestamp, std::move(values));
        }
        return result;
    }

    void reset() {
        std::unique_lock lock(mutex_);
        file_.close();
        file_.open(path_, std::ios::binary | std::ios::out | std::ios::trunc);
        file_.close();
        file_.open(path_, std::ios::binary | std::ios::app | std::ios::in);
        position_ = 0;
    }

private:
    std::string path_;
    std::fstream file_;
    std::mutex mutex_;
    size_t position_;
};

}

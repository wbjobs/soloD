#pragma once

#include "core/common.h"
#include <fstream>
#include <vector>
#include <map>

namespace timescale {

struct SSTableBlock {
    SeriesID series_id;
    Timestamp min_time;
    Timestamp max_time;
    size_t offset;
    size_t size;
    size_t num_points;
};

struct SSTableIndex {
    std::vector<SSTableBlock> blocks;
    std::map<SeriesID, std::vector<size_t>> series_to_blocks;
};

class SSTable {
public:
    SSTable(const std::string& path) : path_(path) {}

    void write(const std::map<std::pair<SeriesID, Timestamp>, std::vector<FieldValue>>& data) {
        std::ofstream file(path_, std::ios::binary);
        SSTableIndex index;

        std::vector<char> buffer;
        SeriesID current_series = UINT64_MAX;
        Timestamp block_min = INT64_MAX, block_max = INT64_MIN;
        size_t block_start = 0;
        size_t block_count = 0;

        for (const auto& [key, values] : data) {
            SeriesID series_id = key.first;
            Timestamp ts = key.second;

            if (series_id != current_series || buffer.size() >= SSTABLE_BLOCK_SIZE) {
                if (current_series != UINT64_MAX) {
                    SSTableBlock block{
                        current_series, block_min, block_max,
                        block_start, buffer.size() - block_start, block_count
                    };
                    index.blocks.push_back(block);
                    index.series_to_blocks[current_series].push_back(index.blocks.size() - 1);
                }
                current_series = series_id;
                block_min = ts;
                block_max = ts;
                block_start = buffer.size();
                block_count = 0;
            }

            block_min = std::min(block_min, ts);
            block_max = std::max(block_max, ts);
            block_count++;

            buffer.insert(buffer.end(), reinterpret_cast<const char*>(&series_id),
                         reinterpret_cast<const char*>(&series_id) + sizeof(series_id));
            buffer.insert(buffer.end(), reinterpret_cast<const char*>(&ts),
                         reinterpret_cast<const char*>(&ts) + sizeof(ts));
            size_t value_count = values.size();
            buffer.insert(buffer.end(), reinterpret_cast<const char*>(&value_count),
                         reinterpret_cast<const char*>(&value_count) + sizeof(value_count));
            for (auto v : values) {
                buffer.insert(buffer.end(), reinterpret_cast<const char*>(&v),
                             reinterpret_cast<const char*>(&v) + sizeof(v));
            }
        }

        if (current_series != UINT64_MAX) {
            SSTableBlock block{
                current_series, block_min, block_max,
                block_start, buffer.size() - block_start, block_count
            };
            index.blocks.push_back(block);
            index.series_to_blocks[current_series].push_back(index.blocks.size() - 1);
        }

        size_t index_offset = buffer.size();
        size_t num_blocks = index.blocks.size();
        buffer.insert(buffer.end(), reinterpret_cast<const char*>(&num_blocks),
                     reinterpret_cast<const char*>(&num_blocks) + sizeof(num_blocks));
        for (const auto& block : index.blocks) {
            buffer.insert(buffer.end(), reinterpret_cast<const char*>(&block.series_id),
                         reinterpret_cast<const char*>(&block.series_id) + sizeof(block.series_id));
            buffer.insert(buffer.end(), reinterpret_cast<const char*>(&block.min_time),
                         reinterpret_cast<const char*>(&block.min_time) + sizeof(block.min_time));
            buffer.insert(buffer.end(), reinterpret_cast<const char*>(&block.max_time),
                         reinterpret_cast<const char*>(&block.max_time) + sizeof(block.max_time));
            buffer.insert(buffer.end(), reinterpret_cast<const char*>(&block.offset),
                         reinterpret_cast<const char*>(&block.offset) + sizeof(block.offset));
            buffer.insert(buffer.end(), reinterpret_cast<const char*>(&block.size),
                         reinterpret_cast<const char*>(&block.size) + sizeof(block.size));
            buffer.insert(buffer.end(), reinterpret_cast<const char*>(&block.num_points),
                         reinterpret_cast<const char*>(&block.num_points) + sizeof(block.num_points));
        }

        buffer.insert(buffer.end(), reinterpret_cast<const char*>(&index_offset),
                     reinterpret_cast<const char*>(&index_offset) + sizeof(index_offset));

        file.write(buffer.data(), buffer.size());
        file.close();
    }

    std::vector<std::pair<Timestamp, std::vector<FieldValue>>> read_range(
        SeriesID series_id, Timestamp start, Timestamp end) {
        load_index();

        std::vector<std::pair<Timestamp, std::vector<FieldValue>>> result;
        auto it = index_.series_to_blocks.find(series_id);
        if (it == index_.series_to_blocks.end()) return result;

        std::ifstream file(path_, std::ios::binary);
        for (size_t block_idx : it->second) {
            const auto& block = index_.blocks[block_idx];
            if (block.max_time < start || block.min_time >= end) continue;

            file.seekg(block.offset);
            std::vector<char> block_data(block.size);
            file.read(block_data.data(), block.size);

            size_t pos = 0;
            while (pos < block.size) {
                SeriesID sid = *reinterpret_cast<SeriesID*>(block_data.data() + pos);
                pos += sizeof(sid);
                Timestamp ts = *reinterpret_cast<Timestamp*>(block_data.data() + pos);
                pos += sizeof(ts);
                size_t value_count = *reinterpret_cast<size_t*>(block_data.data() + pos);
                pos += sizeof(value_count);

                if (sid == series_id && ts >= start && ts < end) {
                    std::vector<FieldValue> values(value_count);
                    for (size_t i = 0; i < value_count; ++i) {
                        values[i] = *reinterpret_cast<FieldValue*>(block_data.data() + pos);
                        pos += sizeof(FieldValue);
                    }
                    result.emplace_back(ts, std::move(values));
                } else {
                    pos += value_count * sizeof(FieldValue);
                }
            }
        }
        return result;
    }

    const SSTableIndex& get_index() const { return index_; }

private:
    void load_index() {
        if (!index_.blocks.empty()) return;

        std::ifstream file(path_, std::ios::binary);
        file.seekg(-sizeof(size_t), std::ios::end);
        size_t index_offset;
        file.read(reinterpret_cast<char*>(&index_offset), sizeof(index_offset));

        file.seekg(index_offset);
        size_t num_blocks;
        file.read(reinterpret_cast<char*>(&num_blocks), sizeof(num_blocks));

        index_.blocks.resize(num_blocks);
        for (size_t i = 0; i < num_blocks; ++i) {
            file.read(reinterpret_cast<char*>(&index_.blocks[i].series_id), sizeof(SeriesID));
            file.read(reinterpret_cast<char*>(&index_.blocks[i].min_time), sizeof(Timestamp));
            file.read(reinterpret_cast<char*>(&index_.blocks[i].max_time), sizeof(Timestamp));
            file.read(reinterpret_cast<char*>(&index_.blocks[i].offset), sizeof(size_t));
            file.read(reinterpret_cast<char*>(&index_.blocks[i].size), sizeof(size_t));
            file.read(reinterpret_cast<char*>(&index_.blocks[i].num_points), sizeof(size_t));
            index_.series_to_blocks[index_.blocks[i].series_id].push_back(i);
        }
    }

    std::string path_;
    SSTableIndex index_;
};

}

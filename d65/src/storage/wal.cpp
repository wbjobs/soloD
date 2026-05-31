#include "storage/wal.h"
#include <sstream>

namespace timescale::storage {

WAL::WAL(const std::string& path) : path_(path) {
    file_.open(path, std::ios::app | std::ios::binary);
}

WAL::~WAL() {
    close();
}

bool WAL::append(const Point& point) {
    std::lock_guard lock(mutex_);
    
    std::ostringstream oss;
    
    size_t measurement_len = point.measurement.size();
    file_.write(reinterpret_cast<const char*>(&measurement_len), sizeof(size_t));
    file_.write(point.measurement.data(), measurement_len);
    
    size_t tag_count = point.tags.size();
    file_.write(reinterpret_cast<const char*>(&tag_count), sizeof(size_t));
    for (const auto& [key, value] : point.tags) {
        size_t key_len = key.size();
        file_.write(reinterpret_cast<const char*>(&key_len), sizeof(size_t));
        file_.write(key.data(), key_len);
        size_t value_len = value.size();
        file_.write(reinterpret_cast<const char*>(&value_len), sizeof(size_t));
        file_.write(value.data(), value_len);
    }
    
    file_.write(reinterpret_cast<const char*>(&point.timestamp), sizeof(Timestamp));
    
    size_t field_count = point.fields.size();
    file_.write(reinterpret_cast<const char*>(&field_count), sizeof(size_t));
    for (const auto& [key, value] : point.fields) {
        size_t key_len = key.size();
        file_.write(reinterpret_cast<const char*>(&key_len), sizeof(size_t));
        file_.write(key.data(), key_len);
        file_.write(reinterpret_cast<const char*>(&value), sizeof(double));
    }
    
    return true;
}

bool WAL::flush() {
    std::lock_guard lock(mutex_);
    file_.flush();
    return true;
}

bool WAL::recover(std::vector<Point>& points) {
    std::ifstream infile(path_, std::ios::binary);
    if (!infile.is_open()) return false;
    
    while (infile.peek() != EOF) {
        Point point;
        
        size_t measurement_len;
        infile.read(reinterpret_cast<char*>(&measurement_len), sizeof(size_t));
        point.measurement.resize(measurement_len);
        infile.read(point.measurement.data(), measurement_len);
        
        size_t tag_count;
        infile.read(reinterpret_cast<char*>(&tag_count), sizeof(size_t));
        for (size_t i = 0; i < tag_count; ++i) {
            size_t key_len, value_len;
            infile.read(reinterpret_cast<char*>(&key_len), sizeof(size_t));
            std::string key(key_len, '\0');
            infile.read(key.data(), key_len);
            infile.read(reinterpret_cast<char*>(&value_len), sizeof(size_t));
            std::string value(value_len, '\0');
            infile.read(value.data(), value_len);
            point.tags[key] = value;
        }
        
        infile.read(reinterpret_cast<char*>(&point.timestamp), sizeof(Timestamp));
        
        size_t field_count;
        infile.read(reinterpret_cast<char*>(&field_count), sizeof(size_t));
        for (size_t i = 0; i < field_count; ++i) {
            size_t key_len;
            infile.read(reinterpret_cast<char*>(&key_len), sizeof(size_t));
            std::string key(key_len, '\0');
            infile.read(key.data(), key_len);
            double value;
            infile.read(reinterpret_cast<char*>(&value), sizeof(double));
            point.fields[key] = value;
        }
        
        points.push_back(std::move(point));
    }
    
    return true;
}

bool WAL::truncate() {
    std::lock_guard lock(mutex_);
    file_.close();
    file_.open(path_, std::ios::trunc | std::ios::out | std::ios::binary);
    return true;
}

bool WAL::close() {
    if (file_.is_open()) {
        file_.flush();
        file_.close();
    }
    return true;
}

}

#pragma once

#include "common/common.h"
#include <fstream>
#include <string>

namespace timescale::storage {

class WAL {
public:
    explicit WAL(const std::string& path);
    ~WAL();

    bool append(const Point& point);
    bool flush();
    bool recover(std::vector<Point>& points);
    bool truncate();
    bool close();

private:
    std::string path_;
    std::ofstream file_;
    std::mutex mutex_;
};

}

#include "index/inverted_index.h"
#include <iostream>
#include <cassert>

using namespace timescale;

void test_series_creation() {
    InvertedIndex index;

    std::map<std::string, TagValue> tags1 = {{"host", "server1"}, {"region", "us-west"}};
    std::map<std::string, TagValue> tags2 = {{"host", "server2"}, {"region", "us-west"}};

    SeriesID id1 = index.get_or_create_series("cpu", tags1);
    SeriesID id2 = index.get_or_create_series("cpu", tags2);
    SeriesID id3 = index.get_or_create_series("cpu", tags1);

    assert(id1 != id2);
    assert(id1 == id3);
    assert(index.series_count() == 2);

    std::cout << "✓ test_series_creation passed" << std::endl;
}

void test_find_series() {
    InvertedIndex index;

    for (int i = 0; i < 5; ++i) {
        std::map<std::string, TagValue> tags = {{"host", "server" + std::to_string(i)}, {"region", "us-west"}};
        index.get_or_create_series("cpu", tags);
    }

    for (int i = 0; i < 3; ++i) {
        std::map<std::string, TagValue> tags = {{"host", "server" + std::to_string(i)}, {"region", "eu-west"}};
        index.get_or_create_series("cpu", tags);
    }

    std::map<std::string, TagValue> query_tags = {{"region", "us-west"}};
    auto result = index.find_series("cpu", query_tags);

    assert(result.size() == 5);
    std::cout << "✓ test_find_series passed" << std::endl;
}

int main() {
    std::cout << "Running InvertedIndex tests..." << std::endl;
    test_series_creation();
    test_find_series();
    std::cout << "All tests passed!" << std::endl;
    return 0;
}

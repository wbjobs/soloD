#include "storage/memtable.h"
#include <iostream>
#include <cassert>

using namespace timescale;

void test_insert_and_range() {
    MemTable memtable;

    Timestamp base = 1000000000LL;
    for (int i = 0; i < 100; ++i) {
        memtable.insert(1, base + i * 1000LL, {static_cast<double>(i)});
    }

    auto result = memtable.get_range(1, base + 20000LL, base + 50000LL);
    assert(result.size() == 30);
    assert(result[0].second[0] == 20.0);
    assert(result[29].second[0] == 49.0);

    std::cout << "✓ test_insert_and_range passed [start, end) semantics" << std::endl;
}

void test_size_limits() {
    MemTable memtable;

    Timestamp base = 1000000000LL;
    int inserted = 0;
    for (int i = 0; i < 100000; ++i) {
        std::vector<FieldValue> values = {1.0, 2.0, 3.0, 4.0, 5.0};
        if (memtable.insert(1, base + i, values)) {
            inserted++;
        } else {
            break;
        }
    }

    assert(memtable.size() > 0);
    assert(inserted > 0);

    std::cout << "✓ test_size_limits passed" << std::endl;
}

int main() {
    std::cout << "Running MemTable tests..." << std::endl;
    test_insert_and_range();
    test_size_limits();
    std::cout << "All tests passed!" << std::endl;
    return 0;
}

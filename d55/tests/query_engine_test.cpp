#include "query/query_engine.h"
#include "query/vector_executor.h"
#include <iostream>
#include <cassert>
#include <cmath>

using namespace timescale;

void test_vector_sum() {
    std::vector<double> values(10000);
    for (int i = 0; i < 10000; ++i) {
        values[i] = i + 1;
    }

    double result;
    VectorAggregator::sum_simd(values, result);

    double expected = 10000 * 10001 / 2.0;
    assert(std::abs(result - expected) < 0.001);

    std::cout << "✓ test_vector_sum passed" << std::endl;
}

void test_vector_min_max() {
    std::vector<double> values = {3.14, 1.41, 2.71, 0.58, 5.0};

    double min_result, max_result;
    VectorAggregator::min_simd(values, min_result);
    VectorAggregator::max_simd(values, max_result);

    assert(std::abs(min_result - 0.58) < 0.001);
    assert(std::abs(max_result - 5.0) < 0.001);

    std::cout << "✓ test_vector_min_max passed" << std::endl;
}

void test_vector_mean() {
    std::vector<double> values = {1.0, 2.0, 3.0, 4.0, 5.0};

    double result;
    VectorAggregator::mean_simd(values, result);

    assert(std::abs(result - 3.0) < 0.001);

    std::cout << "✓ test_vector_mean passed" << std::endl;
}

int main() {
    std::cout << "Running QueryEngine tests..." << std::endl;
    test_vector_sum();
    test_vector_min_max();
    test_vector_mean();
    std::cout << "All tests passed!" << std::endl;
    return 0;
}

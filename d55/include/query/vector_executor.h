#pragma once

#include "core/common.h"
#include <vector>
#include <numeric>
#include <algorithm>
#include <cmath>

namespace timescale {

class VectorAggregator {
public:
    static void sum_simd(const std::vector<double>& values, double& result) {
        size_t n = values.size();
        size_t i = 0;

#if defined(__AVX512F__)
        __m512d sum512 = _mm512_setzero_pd();
        for (; i + 8 <= n; i += 8) {
            __m512d v = _mm512_loadu_pd(&values[i]);
            sum512 = _mm512_add_pd(sum512, v);
        }
        alignas(64) double temp[8];
        _mm512_storeu_pd(temp, sum512);
        result = std::accumulate(temp, temp + 8, 0.0);
#elif defined(__AVX__)
        __m256d sum256 = _mm256_setzero_pd();
        for (; i + 4 <= n; i += 4) {
            __m256d v = _mm256_loadu_pd(&values[i]);
            sum256 = _mm256_add_pd(sum256, v);
        }
        alignas(32) double temp[4];
        _mm256_storeu_pd(temp, sum256);
        result = temp[0] + temp[1] + temp[2] + temp[3];
#elif defined(__SSE2__)
        __m128d sum128 = _mm_setzero_pd();
        for (; i + 2 <= n; i += 2) {
            __m128d v = _mm_loadu_pd(&values[i]);
            sum128 = _mm_add_pd(sum128, v);
        }
        alignas(16) double temp[2];
        _mm_storeu_pd(temp, sum128);
        result = temp[0] + temp[1];
#else
        result = 0.0;
#endif

        for (; i < n; ++i) {
            result += values[i];
        }
    }

    static void min_simd(const std::vector<double>& values, double& result) {
        if (values.empty()) {
            result = 0.0;
            return;
        }

        size_t n = values.size();
        size_t i = 0;
        result = values[0];

#if defined(__AVX512F__)
        __m512d min512 = _mm512_set1_pd(values[0]);
        for (; i + 8 <= n; i += 8) {
            __m512d v = _mm512_loadu_pd(&values[i]);
            min512 = _mm512_min_pd(min512, v);
        }
        alignas(64) double temp[8];
        _mm512_storeu_pd(temp, min512);
        result = *std::min_element(temp, temp + 8);
#elif defined(__AVX__)
        __m256d min256 = _mm256_set1_pd(values[0]);
        for (; i + 4 <= n; i += 4) {
            __m256d v = _mm256_loadu_pd(&values[i]);
            min256 = _mm256_min_pd(min256, v);
        }
        alignas(32) double temp[4];
        _mm256_storeu_pd(temp, min256);
        result = *std::min_element(temp, temp + 4);
#elif defined(__SSE2__)
        __m128d min128 = _mm_set1_pd(values[0]);
        for (; i + 2 <= n; i += 2) {
            __m128d v = _mm_loadu_pd(&values[i]);
            min128 = _mm_min_pd(min128, v);
        }
        alignas(16) double temp[2];
        _mm_storeu_pd(temp, min128);
        result = std::min(temp[0], temp[1]);
#endif

        for (; i < n; ++i) {
            result = std::min(result, values[i]);
        }
    }

    static void max_simd(const std::vector<double>& values, double& result) {
        if (values.empty()) {
            result = 0.0;
            return;
        }

        size_t n = values.size();
        size_t i = 0;
        result = values[0];

#if defined(__AVX512F__)
        __m512d max512 = _mm512_set1_pd(values[0]);
        for (; i + 8 <= n; i += 8) {
            __m512d v = _mm512_loadu_pd(&values[i]);
            max512 = _mm512_max_pd(max512, v);
        }
        alignas(64) double temp[8];
        _mm512_storeu_pd(temp, max512);
        result = *std::max_element(temp, temp + 8);
#elif defined(__AVX__)
        __m256d max256 = _mm256_set1_pd(values[0]);
        for (; i + 4 <= n; i += 4) {
            __m256d v = _mm256_loadu_pd(&values[i]);
            max256 = _mm256_max_pd(max256, v);
        }
        alignas(32) double temp[4];
        _mm256_storeu_pd(temp, max256);
        result = *std::max_element(temp, temp + 4);
#elif defined(__SSE2__)
        __m128d max128 = _mm_set1_pd(values[0]);
        for (; i + 2 <= n; i += 2) {
            __m128d v = _mm_loadu_pd(&values[i]);
            max128 = _mm_max_pd(max128, v);
        }
        alignas(16) double temp[2];
        _mm_storeu_pd(temp, max128);
        result = std::max(temp[0], temp[1]);
#endif

        for (; i < n; ++i) {
            result = std::max(result, values[i]);
        }
    }

    static void mean_simd(const std::vector<double>& values, double& result) {
        if (values.empty()) {
            result = 0.0;
            return;
        }
        sum_simd(values, result);
        result /= values.size();
    }

    static void count_simd(const std::vector<double>& values, size_t& result) {
        result = values.size();
    }
};

}

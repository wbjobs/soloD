#ifndef SATD_COST_H
#define SATD_COST_H

#include "hevc_common.h"
#include <cstdint>

class SATDCost {
public:
    SATDCost();
    ~SATDCost();

    uint64_t compute_satd(const uint8_t* orig, int orig_stride,
                          const uint8_t* pred, int pred_stride,
                          int width, int height, int bit_depth);
    
    uint64_t compute_sad(const uint8_t* orig, int orig_stride,
                         const uint8_t* pred, int pred_stride,
                         int width, int height, int bit_depth);
    
    uint64_t compute_cost(const uint8_t* orig, int orig_stride,
                          const uint8_t* pred, int pred_stride,
                          int width, int height, int bit_depth,
                          int qp, bool use_satd = true);

private:
    void hadamard_transform_4x4(int16_t* block);
    void hadamard_transform_8x8(int16_t* block);
    void hadamard_transform_16x16(int16_t* block);
    void hadamard_transform_32x32(int16_t* block);
    
    void init_hadamard_tables();
    
    int16_t* m_temp_buffer;
};

#endif

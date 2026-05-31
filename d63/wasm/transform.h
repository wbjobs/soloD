#ifndef TRANSFORM_H
#define TRANSFORM_H

#include "hevc_common.h"
#include <cstdint>

class Transform {
public:
    Transform();
    ~Transform();

    void forward_dct(int16_t* block, int width, int height);
    void inverse_dct(int16_t* block, int width, int height);
    
    void quantize(int16_t* coeff, int width, int height, int qp, int bit_depth);
    void dequantize(int16_t* coeff, int width, int height, int qp, int bit_depth);
    
    void transform_and_quantize(const uint8_t* residual, int residual_stride,
                                int16_t* coeff, int width, int height,
                                int qp, int bit_depth);
    
    void dequantize_and_transform(const int16_t* coeff,
                                  uint8_t* residual, int residual_stride,
                                  int width, int height,
                                  int qp, int bit_depth);

private:
    void dct_4x4(int16_t* block);
    void idct_4x4(int16_t* block);
    void dct_8x8(int16_t* block);
    void idct_8x8(int16_t* block);
    void dct_16x16(int16_t* block);
    void idct_16x16(int16_t* block);
    void dct_32x32(int16_t* block);
    void idct_32x32(int16_t* block);
    
    int get_q_scale(int qp, int bit_depth);
    
    int16_t* m_temp_buffer;
};

#endif

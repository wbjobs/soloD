#include "satd_cost.h"
#include <cstring>
#include <algorithm>
#include <cmath>

SATDCost::SATDCost() {
    m_temp_buffer = new int16_t[MAX_TU_SIZE * MAX_TU_SIZE];
}

SATDCost::~SATDCost() {
    delete[] m_temp_buffer;
}

uint64_t SATDCost::compute_sad(const uint8_t* orig, int orig_stride,
                                const uint8_t* pred, int pred_stride,
                                int width, int height, int bit_depth) {
    uint64_t sad = 0;
    
    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            sad += std::abs((int)orig[y * orig_stride + x] - (int)pred[y * pred_stride + x]);
        }
    }
    
    return sad;
}

void SATDCost::hadamard_transform_4x4(int16_t* block) {
    int16_t tmp[16];
    
    for (int i = 0; i < 4; i++) {
        int a0 = block[i * 4 + 0] + block[i * 4 + 1];
        int a1 = block[i * 4 + 0] - block[i * 4 + 1];
        int a2 = block[i * 4 + 2] + block[i * 4 + 3];
        int a3 = block[i * 4 + 2] - block[i * 4 + 3];
        
        tmp[i * 4 + 0] = a0 + a2;
        tmp[i * 4 + 1] = a1 + a3;
        tmp[i * 4 + 2] = a1 - a3;
        tmp[i * 4 + 3] = a0 - a2;
    }
    
    for (int i = 0; i < 4; i++) {
        int a0 = tmp[0 * 4 + i] + tmp[1 * 4 + i];
        int a1 = tmp[0 * 4 + i] - tmp[1 * 4 + i];
        int a2 = tmp[2 * 4 + i] + tmp[3 * 4 + i];
        int a3 = tmp[2 * 4 + i] - tmp[3 * 4 + i];
        
        block[0 * 4 + i] = a0 + a2;
        block[1 * 4 + i] = a1 + a3;
        block[2 * 4 + i] = a1 - a3;
        block[3 * 4 + i] = a0 - a2;
    }
}

void SATDCost::hadamard_transform_8x8(int16_t* block) {
    int16_t tmp[64];
    
    for (int i = 0; i < 8; i++) {
        int a0 = block[i * 8 + 0] + block[i * 8 + 1];
        int a1 = block[i * 8 + 0] - block[i * 8 + 1];
        int a2 = block[i * 8 + 2] + block[i * 8 + 3];
        int a3 = block[i * 8 + 2] - block[i * 8 + 3];
        int a4 = block[i * 8 + 4] + block[i * 8 + 5];
        int a5 = block[i * 8 + 4] - block[i * 8 + 5];
        int a6 = block[i * 8 + 6] + block[i * 8 + 7];
        int a7 = block[i * 8 + 6] - block[i * 8 + 7];
        
        int b0 = a0 + a2;
        int b1 = a1 + a3;
        int b2 = a1 - a3;
        int b3 = a0 - a2;
        int b4 = a4 + a6;
        int b5 = a5 + a7;
        int b6 = a5 - a7;
        int b7 = a4 - a6;
        
        tmp[i * 8 + 0] = b0 + b4;
        tmp[i * 8 + 1] = b1 + b5;
        tmp[i * 8 + 2] = b2 + b6;
        tmp[i * 8 + 3] = b3 + b7;
        tmp[i * 8 + 4] = b3 - b7;
        tmp[i * 8 + 5] = b2 - b6;
        tmp[i * 8 + 6] = b1 - b5;
        tmp[i * 8 + 7] = b0 - b4;
    }
    
    for (int i = 0; i < 8; i++) {
        int a0 = tmp[0 * 8 + i] + tmp[1 * 8 + i];
        int a1 = tmp[0 * 8 + i] - tmp[1 * 8 + i];
        int a2 = tmp[2 * 8 + i] + tmp[3 * 8 + i];
        int a3 = tmp[2 * 8 + i] - tmp[3 * 8 + i];
        int a4 = tmp[4 * 8 + i] + tmp[5 * 8 + i];
        int a5 = tmp[4 * 8 + i] - tmp[5 * 8 + i];
        int a6 = tmp[6 * 8 + i] + tmp[7 * 8 + i];
        int a7 = tmp[6 * 8 + i] - tmp[7 * 8 + i];
        
        int b0 = a0 + a2;
        int b1 = a1 + a3;
        int b2 = a1 - a3;
        int b3 = a0 - a2;
        int b4 = a4 + a6;
        int b5 = a5 + a7;
        int b6 = a5 - a7;
        int b7 = a4 - a6;
        
        block[0 * 8 + i] = b0 + b4;
        block[1 * 8 + i] = b1 + b5;
        block[2 * 8 + i] = b2 + b6;
        block[3 * 8 + i] = b3 + b7;
        block[4 * 8 + i] = b3 - b7;
        block[5 * 8 + i] = b2 - b6;
        block[6 * 8 + i] = b1 - b5;
        block[7 * 8 + i] = b0 - b4;
    }
}

void SATDCost::hadamard_transform_16x16(int16_t* block) {
    int16_t tmp[256];
    
    for (int i = 0; i < 16; i++) {
        memcpy(tmp + i * 16, block + i * 16, 16 * sizeof(int16_t));
    }
    
    for (int i = 0; i < 16; i++) {
        for (int j = 0; j < 8; j++) {
            int k = 15 - j;
            int a = tmp[i * 16 + j] + tmp[i * 16 + k];
            int b = tmp[i * 16 + j] - tmp[i * 16 + k];
            tmp[i * 16 + j] = a;
            tmp[i * 16 + k] = b;
        }
    }
    
    for (int i = 0; i < 16; i++) {
        for (int j = 0; j < 8; j++) {
            int k = 15 - j;
            int a = tmp[j * 16 + i] + tmp[k * 16 + i];
            int b = tmp[j * 16 + i] - tmp[k * 16 + i];
            block[j * 16 + i] = a;
            block[k * 16 + i] = b;
        }
    }
}

void SATDCost::hadamard_transform_32x32(int16_t* block) {
    int16_t tmp[1024];
    
    for (int i = 0; i < 32; i++) {
        memcpy(tmp + i * 32, block + i * 32, 32 * sizeof(int16_t));
    }
    
    for (int i = 0; i < 32; i++) {
        for (int j = 0; j < 16; j++) {
            int k = 31 - j;
            int a = tmp[i * 32 + j] + tmp[i * 32 + k];
            int b = tmp[i * 32 + j] - tmp[i * 32 + k];
            tmp[i * 32 + j] = a;
            tmp[i * 32 + k] = b;
        }
    }
    
    for (int i = 0; i < 32; i++) {
        for (int j = 0; j < 16; j++) {
            int k = 31 - j;
            int a = tmp[j * 32 + i] + tmp[k * 32 + i];
            int b = tmp[j * 32 + i] - tmp[k * 32 + i];
            block[j * 32 + i] = a;
            block[k * 32 + i] = b;
        }
    }
}

uint64_t SATDCost::compute_satd(const uint8_t* orig, int orig_stride,
                                 const uint8_t* pred, int pred_stride,
                                 int width, int height, int bit_depth) {
    int16_t* diff = m_temp_buffer;
    
    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            diff[y * width + x] = (int16_t)orig[y * orig_stride + x] - 
                                  (int16_t)pred[y * pred_stride + x];
        }
    }
    
    if (width == 4 && height == 4) {
        hadamard_transform_4x4(diff);
    } else if (width == 8 && height == 8) {
        hadamard_transform_8x8(diff);
    } else if (width == 16 && height == 16) {
        hadamard_transform_16x16(diff);
    } else if (width == 32 && height == 32) {
        hadamard_transform_32x32(diff);
    }
    
    uint64_t satd = 0;
    for (int i = 0; i < width * height; i++) {
        satd += std::abs(diff[i]);
    }
    
    if (width == 4) satd >>= 1;
    else if (width == 8) satd >>= 2;
    else if (width == 16) satd >>= 3;
    else if (width == 32) satd >>= 4;
    
    return satd;
}

uint64_t SATDCost::compute_cost(const uint8_t* orig, int orig_stride,
                                 const uint8_t* pred, int pred_stride,
                                 int width, int height, int bit_depth,
                                 int qp, bool use_satd) {
    uint64_t distortion;
    
    if (use_satd) {
        distortion = compute_satd(orig, orig_stride, pred, pred_stride, 
                                  width, height, bit_depth);
    } else {
        distortion = compute_sad(orig, orig_stride, pred, pred_stride,
                                 width, height, bit_depth);
    }
    
    double lambda = std::pow(2.0, (qp - 12) / 3.0) * 0.85;
    
    return (uint64_t)(distortion * lambda);
}

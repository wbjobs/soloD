#include "transform.h"
#include <cstring>
#include <algorithm>
#include <cmath>

Transform::Transform() {
    m_temp_buffer = new int16_t[MAX_TU_SIZE * MAX_TU_SIZE];
}

Transform::~Transform() {
    delete[] m_temp_buffer;
}

int Transform::get_q_scale(int qp, int bit_depth) {
    static const int q_scales[52] = {
        26214, 23302, 20560, 18396, 16384, 14564, 12960, 11574,
        10240, 9102, 8064, 7224, 6400, 5670, 5040, 4480,
        4032, 3556, 3136, 2772, 2450, 2170, 1918, 1694,
        1498, 1322, 1166, 1028, 906, 800, 706, 622,
        548, 484, 426, 376, 332, 292, 258, 228,
        202, 178, 158, 140, 124, 110, 98, 86,
        76, 68, 60, 54
    };
    
    int idx = std::min(std::max(qp, 0), 51);
    int shift = 19 + bit_depth - 8;
    return q_scales[idx] << shift;
}

void Transform::dct_4x4(int16_t* block) {
    int16_t tmp[16];
    const int C1 = 8035;
    const int C2 = 11363;
    const int C3 = 15213;
    
    for (int i = 0; i < 4; i++) {
        int a0 = block[i * 4 + 0] + block[i * 4 + 3];
        int a1 = block[i * 4 + 1] + block[i * 4 + 2];
        int a2 = block[i * 4 + 1] - block[i * 4 + 2];
        int a3 = block[i * 4 + 0] - block[i * 4 + 3];
        
        tmp[i * 4 + 0] = C3 * (a0 + a1);
        tmp[i * 4 + 1] = C1 * a3 + C2 * a2;
        tmp[i * 4 + 2] = C3 * (a0 - a1);
        tmp[i * 4 + 3] = C2 * a3 - C1 * a2;
    }
    
    for (int i = 0; i < 4; i++) {
        int a0 = tmp[0 * 4 + i] + tmp[3 * 4 + i];
        int a1 = tmp[1 * 4 + i] + tmp[2 * 4 + i];
        int a2 = tmp[1 * 4 + i] - tmp[2 * 4 + i];
        int a3 = tmp[0 * 4 + i] - tmp[3 * 4 + i];
        
        block[0 * 4 + i] = (int16_t)((C3 * (a0 + a1)) >> 20);
        block[1 * 4 + i] = (int16_t)((C1 * a3 + C2 * a2) >> 20);
        block[2 * 4 + i] = (int16_t)((C3 * (a0 - a1)) >> 20);
        block[3 * 4 + i] = (int16_t)((C2 * a3 - C1 * a2) >> 20);
    }
}

void Transform::idct_4x4(int16_t* block) {
    int16_t tmp[16];
    const int C1 = 8035;
    const int C2 = 11363;
    const int C3 = 15213;
    
    for (int i = 0; i < 4; i++) {
        int a0 = C3 * block[0 * 4 + i] + C3 * block[2 * 4 + i];
        int a1 = C3 * block[0 * 4 + i] - C3 * block[2 * 4 + i];
        int a2 = C1 * block[1 * 4 + i] - C2 * block[3 * 4 + i];
        int a3 = C2 * block[1 * 4 + i] + C1 * block[3 * 4 + i];
        
        tmp[i * 4 + 0] = a0 + a3;
        tmp[i * 4 + 1] = a1 + a2;
        tmp[i * 4 + 2] = a1 - a2;
        tmp[i * 4 + 3] = a0 - a3;
    }
    
    for (int i = 0; i < 4; i++) {
        int a0 = C3 * tmp[i * 4 + 0] + C3 * tmp[i * 4 + 2];
        int a1 = C3 * tmp[i * 4 + 0] - C3 * tmp[i * 4 + 2];
        int a2 = C1 * tmp[i * 4 + 1] - C2 * tmp[i * 4 + 3];
        int a3 = C2 * tmp[i * 4 + 1] + C1 * tmp[i * 4 + 3];
        
        block[i * 4 + 0] = (int16_t)((a0 + a3) >> 20);
        block[i * 4 + 1] = (int16_t)((a1 + a2) >> 20);
        block[i * 4 + 2] = (int16_t)((a1 - a2) >> 20);
        block[i * 4 + 3] = (int16_t)((a0 - a3) >> 20);
    }
}

void Transform::dct_8x8(int16_t* block) {
    memcpy(m_temp_buffer, block, 64 * sizeof(int16_t));
    
    for (int i = 0; i < 8; i++) {
        int tmp[8];
        for (int j = 0; j < 8; j++) {
            int sum = 0;
            for (int k = 0; k < 8; k++) {
                double c = (k == 0) ? 1.0 / sqrt(2) : 1.0;
                sum += (int)(m_temp_buffer[i * 8 + k] * c * cos(M_PI * (2 * j + 1) * k / 16.0));
            }
            tmp[j] = (int16_t)(sum / 2);
        }
        memcpy(block + i * 8, tmp, 8 * sizeof(int16_t));
    }
    
    memcpy(m_temp_buffer, block, 64 * sizeof(int16_t));
    
    for (int i = 0; i < 8; i++) {
        int tmp[8];
        for (int j = 0; j < 8; j++) {
            int sum = 0;
            for (int k = 0; k < 8; k++) {
                double c = (k == 0) ? 1.0 / sqrt(2) : 1.0;
                sum += (int)(m_temp_buffer[k * 8 + i] * c * cos(M_PI * (2 * j + 1) * k / 16.0));
            }
            tmp[j] = (int16_t)(sum / 2);
        }
        for (int j = 0; j < 8; j++) {
            block[j * 8 + i] = tmp[j];
        }
    }
}

void Transform::idct_8x8(int16_t* block) {
    memcpy(m_temp_buffer, block, 64 * sizeof(int16_t));
    
    for (int i = 0; i < 8; i++) {
        int tmp[8];
        for (int j = 0; j < 8; j++) {
            double sum = 0.5 * m_temp_buffer[i * 8 + 0];
            for (int k = 1; k < 8; k++) {
                double c = (j == 0) ? 1.0 / sqrt(2) : 1.0;
                sum += m_temp_buffer[i * 8 + k] * c * cos(M_PI * (2 * k + 1) * j / 16.0);
            }
            tmp[j] = (int16_t)(sum / 2);
        }
        memcpy(block + i * 8, tmp, 8 * sizeof(int16_t));
    }
}

void Transform::dct_16x16(int16_t* block) {
    for (int i = 0; i < 16; i++) {
        for (int j = 0; j < 4; j++) {
            for (int k = 0; k < 4; k++) {
                int idx = (i / 4) * 4 * 16 + (i % 4) * 4 + j * 16 + k;
                m_temp_buffer[idx] = block[i * 16 + j * 4 + k];
            }
        }
    }
    
    for (int i = 0; i < 16; i++) {
        dct_4x4(m_temp_buffer + i * 16);
    }
    
    for (int i = 0; i < 16; i++) {
        for (int j = 0; j < 4; j++) {
            for (int k = 0; k < 4; k++) {
                int idx = (i / 4) * 4 * 16 + (i % 4) * 4 + j * 16 + k;
                block[i * 16 + j * 4 + k] = m_temp_buffer[idx];
            }
        }
    }
}

void Transform::idct_16x16(int16_t* block) {
    for (int i = 0; i < 16; i++) {
        for (int j = 0; j < 4; j++) {
            for (int k = 0; k < 4; k++) {
                int idx = (i / 4) * 4 * 16 + (i % 4) * 4 + j * 16 + k;
                m_temp_buffer[idx] = block[i * 16 + j * 4 + k];
            }
        }
    }
    
    for (int i = 0; i < 16; i++) {
        idct_4x4(m_temp_buffer + i * 16);
    }
    
    for (int i = 0; i < 16; i++) {
        for (int j = 0; j < 4; j++) {
            for (int k = 0; k < 4; k++) {
                int idx = (i / 4) * 4 * 16 + (i % 4) * 4 + j * 16 + k;
                block[i * 16 + j * 4 + k] = m_temp_buffer[idx];
            }
        }
    }
}

void Transform::dct_32x32(int16_t* block) {
    for (int i = 0; i < 16; i++) {
        dct_8x8(block + i * 64);
    }
}

void Transform::idct_32x32(int16_t* block) {
    for (int i = 0; i < 16; i++) {
        idct_8x8(block + i * 64);
    }
}

void Transform::forward_dct(int16_t* block, int width, int height) {
    if (width == 4 && height == 4) {
        dct_4x4(block);
    } else if (width == 8 && height == 8) {
        dct_8x8(block);
    } else if (width == 16 && height == 16) {
        dct_16x16(block);
    } else if (width == 32 && height == 32) {
        dct_32x32(block);
    }
}

void Transform::inverse_dct(int16_t* block, int width, int height) {
    if (width == 4 && height == 4) {
        idct_4x4(block);
    } else if (width == 8 && height == 8) {
        idct_8x8(block);
    } else if (width == 16 && height == 16) {
        idct_16x16(block);
    } else if (width == 32 && height == 32) {
        idct_32x32(block);
    }
}

void Transform::quantize(int16_t* coeff, int width, int height, int qp, int bit_depth) {
    int q_scale = get_q_scale(qp, bit_depth);
    int shift = 14 + bit_depth;
    
    for (int i = 0; i < width * height; i++) {
        int sign = coeff[i] >= 0 ? 1 : -1;
        int abs_val = std::abs((int)coeff[i]);
        int quantized = (abs_val * q_scale + (1 << (shift - 1))) >> shift;
        coeff[i] = (int16_t)(sign * quantized);
    }
}

void Transform::dequantize(int16_t* coeff, int width, int height, int qp, int bit_depth) {
    int q_scale = get_q_scale(qp, bit_depth);
    int shift = 14 + bit_depth;
    
    for (int i = 0; i < width * height; i++) {
        coeff[i] = (int16_t)((int)coeff[i] * q_scale) >> shift);
    }
}

void Transform::transform_and_quantize(const uint8_t* residual, int residual_stride,
                                     int16_t* coeff, int width, int height,
                                     int qp, int bit_depth) {
    int16_t* block = m_temp_buffer;
    
    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            block[y * width + x] = (int16_t)residual[y * residual_stride + x] - 128;
        }
    }
    
    forward_dct(block, width, height);
    quantize(block, width, height, qp, bit_depth);
    
    memcpy(coeff, block, width * height * sizeof(int16_t));
}

void Transform::dequantize_and_transform(const int16_t* coeff,
                                           uint8_t* residual, int residual_stride,
                                           int width, int height,
                                           int qp, int bit_depth) {
    int16_t* block = m_temp_buffer;
    memcpy(block, coeff, width * height * sizeof(int16_t));
    
    dequantize(block, width, height, qp, bit_depth);
    inverse_dct(block, width, height);
    
    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            int val = block[y * width + x] + 128;
            residual[y * residual_stride + x] = (uint8_t)std::clamp(val, 0, 255);
        }
    }
}

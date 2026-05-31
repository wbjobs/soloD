#include "intra_prediction.h"
#include <cstring>
#include <algorithm>
#include <cmath>

static const int g_angular_table[35] = {
    0, 0, -32, -26, -21, -17, -13, -9, -5, -2, 0,
    2, 5, 9, 13, 17, 21, 26, 32, 26, 21, 17, 13,
    9, 5, 2, 0, -2, -5, -9, -13, -17, -21, -26, -32
};

static const int g_inv_angular_table[35] = {
    0, 0, 34, 33, 32, 31, 30, 29, 28, 27, 26,
    25, 24, 23, 22, 21, 20, 19, 18, 19, 20, 21, 22,
    23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34
};

IntraPrediction::IntraPrediction() {
    m_ref_buffer = new int16_t[MAX_REF_SIZE * 3];
}

IntraPrediction::~IntraPrediction() {
    delete[] m_ref_buffer;
}

int IntraPrediction::get_angular_inverse_mode(int mode) {
    return g_inv_angular_table[mode];
}

int IntraPrediction::get_angular_angle(int mode) {
    return g_angular_table[mode];
}

void IntraPrediction::fill_reference_samples(const uint8_t* src, int src_stride,
                                             int16_t* ref_main, int16_t* ref_left,
                                             int16_t* ref_top, int width, int height) {
    int size = std::max(width, height);
    
    for (int i = 0; i <= size; i++) {
        ref_top[i] = src[-src_stride + i - 1];
    }
    
    for (int i = 0; i <= size; i++) {
        ref_left[i] = src[(i - 1) * src_stride - 1];
    }
    
    ref_main[0] = (ref_top[0] + ref_left[0] + 1) >> 1;
    
    for (int i = 1; i <= size; i++) {
        ref_main[i] = ref_top[i];
        ref_main[size + i] = ref_left[i];
    }
}

void IntraPrediction::filter_reference_samples(int16_t* ref_main, int16_t* ref_left,
                                               int16_t* ref_top, int width, int height,
                                               int mode, int bit_depth) {
    int size = std::max(width, height);
    bool filter_flag = (width >= 16 && height >= 16);
    
    if (!filter_flag) return;
    
    if (mode >= 2 && mode <= 12) {
        for (int i = 1; i <= size; i++) {
            ref_top[i] = (ref_top[i - 1] + 2 * ref_top[i] + ref_top[i + 1] + 2) >> 2;
        }
    }
    
    if (mode >= 18 && mode <= 34) {
        for (int i = 1; i <= size; i++) {
            ref_left[i] = (ref_left[i - 1] + 2 * ref_left[i] + ref_left[i + 1] + 2) >> 2;
        }
    }
}

void IntraPrediction::predict_planar(uint8_t* dst, int dst_stride, const uint8_t* src,
                                     int src_stride, int width, int height, int bit_depth) {
    int16_t ref_left[MAX_REF_SIZE];
    int16_t ref_top[MAX_REF_SIZE];
    
    for (int i = 0; i < width; i++) {
        ref_top[i] = src[-src_stride + i];
    }
    
    for (int i = 0; i < height; i++) {
        ref_left[i] = src[i * src_stride - 1];
    }
    
    int top_right = ref_top[width - 1];
    int bottom_left = ref_left[height - 1];
    
    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            int hor = (width - 1 - x) * ref_left[y] + x * top_right;
            int ver = (height - 1 - y) * ref_top[x] + y * bottom_left;
            int val = (hor + ver + width) >> (int)log2(width + 1);
            dst[y * dst_stride + x] = (uint8_t)std::clamp(val, 0, 255);
        }
    }
}

void IntraPrediction::predict_dc(uint8_t* dst, int dst_stride, const uint8_t* src,
                                 int src_stride, int width, int height, int bit_depth) {
    int sum = 0;
    int count = 0;
    
    for (int i = 0; i < width; i++) {
        sum += src[-src_stride + i];
        count++;
    }
    
    for (int i = 0; i < height; i++) {
        sum += src[i * src_stride - 1];
        count++;
    }
    
    int dc_val = (sum + count / 2) / count;
    
    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            dst[y * dst_stride + x] = (uint8_t)dc_val;
        }
    }
}

void IntraPrediction::predict_angular(uint8_t* dst, int dst_stride, const uint8_t* src,
                                      int src_stride, int width, int height, int mode,
                                      int bit_depth) {
    int16_t ref_left[MAX_REF_SIZE];
    int16_t ref_top[MAX_REF_SIZE];
    int16_t ref_main[MAX_REF_SIZE * 2 + 1];
    
    fill_reference_samples(src, src_stride, ref_main, ref_left, ref_top, width, height);
    filter_reference_samples(ref_main, ref_left, ref_top, width, height, mode, bit_depth);
    
    int angle = get_angular_angle(mode);
    int abs_angle = std::abs(angle);
    int sign = angle >= 0 ? 1 : -1;
    
    bool is_vertical = (mode >= 18 && mode <= 34);
    bool is_horizontal = (mode >= 2 && mode <= 17);
    
    if (is_vertical) {
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int delta = (y * abs_angle + 32) >> 6;
                int pos = x + delta;
                int frac = (y * abs_angle) & 0x3F;
                
                int val;
                if (pos <= 0) {
                    val = ref_main[0];
                } else if (pos >= width) {
                    int diag_pos = pos - width;
                    val = ref_main[width + diag_pos];
                } else {
                    int a = ref_main[pos];
                    int b = ref_main[pos + 1];
                    val = ((64 - frac) * a + frac * b + 32) >> 6;
                }
                
                dst[y * dst_stride + x] = (uint8_t)std::clamp(val, 0, 255);
            }
        }
    } else if (is_horizontal) {
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                int delta = (x * abs_angle + 32) >> 6;
                int pos = y + delta;
                int frac = (x * abs_angle) & 0x3F;
                
                int val;
                if (pos <= 0) {
                    val = ref_main[0];
                } else if (pos >= height) {
                    int diag_pos = pos - height;
                    val = ref_main[height + diag_pos];
                } else {
                    int a = ref_main[height + pos];
                    int b = ref_main[height + pos + 1];
                    val = ((64 - frac) * a + frac * b + 32) >> 6;
                }
                
                dst[y * dst_stride + x] = (uint8_t)std::clamp(val, 0, 255);
            }
        }
    }
}

void IntraPrediction::predict(uint8_t* dst, int dst_stride, const uint8_t* src,
                              int src_stride, int width, int height, int mode,
                              int bit_depth) {
    switch (mode) {
        case INTRA_PLANAR:
            predict_planar(dst, dst_stride, src, src_stride, width, height, bit_depth);
            break;
        case INTRA_DC:
            predict_dc(dst, dst_stride, src, src_stride, width, height, bit_depth);
            break;
        default:
            predict_angular(dst, dst_stride, src, src_stride, width, height, mode, bit_depth);
            break;
    }
}

int IntraPrediction::get_best_mode(const uint8_t* orig, int orig_stride, const uint8_t* ref,
                                   int ref_stride, int width, int height, int bit_depth,
                                   int qp) {
    uint8_t pred[MAX_CU_SIZE * MAX_CU_SIZE];
    int best_cost = 0x7FFFFFFF;
    int best_mode = INTRA_DC;
    
    int modes_to_check[] = {INTRA_PLANAR, INTRA_DC, INTRA_ANGULAR_10, INTRA_ANGULAR_26,
                           INTRA_ANGULAR_2, INTRA_ANGULAR_18, INTRA_ANGULAR_34};
    int num_modes = sizeof(modes_to_check) / sizeof(modes_to_check[0]);
    
    for (int i = 0; i < num_modes; i++) {
        int mode = modes_to_check[i];
        predict(pred, width, ref, ref_stride, width, height, mode, bit_depth);
        
        int sad = 0;
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                sad += std::abs(orig[y * orig_stride + x] - pred[y * width + x]);
            }
        }
        
        int lambda = (int)(std::pow(2.0, (qp - 12) / 3.0) * 0.85);
        int cost = sad + lambda * (mode == INTRA_PLANAR || mode == INTRA_DC ? 0 : 2);
        
        if (cost < best_cost) {
            best_cost = cost;
            best_mode = mode;
        }
    }
    
    return best_mode;
}

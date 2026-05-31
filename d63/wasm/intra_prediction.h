#ifndef INTRA_PREDICTION_H
#define INTRA_PREDICTION_H

#include "hevc_common.h"
#include <cstdint>

class IntraPrediction {
public:
    IntraPrediction();
    ~IntraPrediction();

    void predict_planar(uint8_t* dst, int dst_stride, const uint8_t* src, 
                        int src_stride, int width, int height, int bit_depth);
    
    void predict_dc(uint8_t* dst, int dst_stride, const uint8_t* src, 
                    int src_stride, int width, int height, int bit_depth);
    
    void predict_angular(uint8_t* dst, int dst_stride, const uint8_t* src, 
                         int src_stride, int width, int height, int mode, 
                         int bit_depth);
    
    void predict(uint8_t* dst, int dst_stride, const uint8_t* src, 
                 int src_stride, int width, int height, int mode, 
                 int bit_depth);

    int get_best_mode(const uint8_t* orig, int orig_stride, const uint8_t* ref, 
                      int ref_stride, int width, int height, int bit_depth,
                      int qp);

private:
    void fill_reference_samples(const uint8_t* src, int src_stride,
                                int16_t* ref_main, int16_t* ref_left,
                                int16_t* ref_top, int width, int height);
    
    void filter_reference_samples(int16_t* ref_main, int16_t* ref_left,
                                  int16_t* ref_top, int width, int height,
                                  int mode, int bit_depth);
    
    int get_angular_inverse_mode(int mode);
    int get_angular_angle(int mode);
    
    void init_angular_tables();
    
    int16_t* m_ref_buffer;
    static const int ANGULAR_OFFSET = 32;
    static const int MAX_REF_SIZE = 128;
};

#endif

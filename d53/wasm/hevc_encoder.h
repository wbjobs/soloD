#ifndef HEVC_ENCODER_H
#define HEVC_ENCODER_H

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

#define MAX_CU_SIZE 64
#define MIN_CU_SIZE 4
#define MAX_TU_SIZE 32
#define MIN_TU_SIZE 4
#define NUM_INTRA_MODES 35
#define INTRA_PLANAR 0
#define INTRA_DC 1
#define INTRA_ANGULAR_2 2
#define INTRA_ANGULAR_34 34

typedef struct {
    uint8_t* y_data;
    uint8_t* u_data;
    uint8_t* v_data;
    int width;
    int height;
    int stride;
} HEVCFrame;

typedef struct {
    uint8_t* data;
    size_t size;
    size_t capacity;
} Bitstream;

typedef struct {
    int width;
    int height;
    int qp;
    int max_cu_depth;
    int min_cu_depth;
} HEVCEncoderConfig;

typedef struct HEVCEncoder HEVCEncoder;

HEVCEncoder* hevc_encoder_create(const HEVCEncoderConfig* config);
void hevc_encoder_destroy(HEVCEncoder* encoder);
int hevc_encoder_encode_frame(HEVCEncoder* encoder, const HEVCFrame* frame, Bitstream* bitstream);
void hevc_encoder_get_stats(HEVCEncoder* encoder, int* bits_encoded, float* psnr);

#ifdef __cplusplus
}
#endif

#endif

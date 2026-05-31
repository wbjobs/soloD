#ifndef HEVC_COMMON_H
#define HEVC_COMMON_H

#include <cstdint>
#include <cstddef>

#define MAX_CU_SIZE 64
#define MIN_CU_SIZE 4
#define MAX_TU_SIZE 32
#define MIN_TU_SIZE 4

#define NUM_INTRA_MODES 35
#define INTRA_PLANAR 0
#define INTRA_DC 1
#define INTRA_ANGULAR_2 2
#define INTRA_ANGULAR_3 3
#define INTRA_ANGULAR_4 4
#define INTRA_ANGULAR_5 5
#define INTRA_ANGULAR_6 6
#define INTRA_ANGULAR_7 7
#define INTRA_ANGULAR_8 8
#define INTRA_ANGULAR_9 9
#define INTRA_ANGULAR_10 10
#define INTRA_ANGULAR_11 11
#define INTRA_ANGULAR_12 12
#define INTRA_ANGULAR_13 13
#define INTRA_ANGULAR_14 14
#define INTRA_ANGULAR_15 15
#define INTRA_ANGULAR_16 16
#define INTRA_ANGULAR_17 17
#define INTRA_ANGULAR_18 18
#define INTRA_ANGULAR_19 19
#define INTRA_ANGULAR_20 20
#define INTRA_ANGULAR_21 21
#define INTRA_ANGULAR_22 22
#define INTRA_ANGULAR_23 23
#define INTRA_ANGULAR_24 24
#define INTRA_ANGULAR_25 25
#define INTRA_ANGULAR_26 26
#define INTRA_ANGULAR_27 27
#define INTRA_ANGULAR_28 28
#define INTRA_ANGULAR_29 29
#define INTRA_ANGULAR_30 30
#define INTRA_ANGULAR_31 31
#define INTRA_ANGULAR_32 32
#define INTRA_ANGULAR_33 33
#define INTRA_ANGULAR_34 34

#define INTRA_ANGULAR_VERTICAL 26
#define INTRA_ANGULAR_HORIZONTAL 10

#define MAX_DEPTH 3

typedef struct {
    uint8_t* y;
    uint8_t* u;
    uint8_t* v;
    int width;
    int height;
    int stride;
} YUVFrame;

typedef struct {
    int x;
    int y;
    int width;
    int height;
    int depth;
    int intra_mode;
    int split_flag;
    int qp;
} CodingUnit;

typedef struct {
    uint8_t* data;
    size_t size;
    size_t capacity;
} Bitstream;

typedef struct {
    int width;
    int height;
    int qp;
    int max_depth;
    int use_satd;
} EncoderConfig;

typedef struct {
    EncoderConfig config;
    YUVFrame current_frame;
    YUVFrame reference_frame;
    Bitstream bitstream;
    CodingUnit* cu_tree;
    int cu_tree_size;
} HEVCEncoder;

#ifdef __cplusplus
extern "C" {
#endif

HEVCEncoder* hevc_encoder_init(int width, int height, int qp);
void hevc_encoder_destroy(HEVCEncoder* encoder);
int hevc_encoder_encode_frame(HEVCEncoder* encoder, const uint8_t* yuv_data);
uint8_t* hevc_encoder_get_bitstream(HEVCEncoder* encoder);
size_t hevc_encoder_get_bitstream_size(HEVCEncoder* encoder);

#ifdef __cplusplus
}
#endif

#endif

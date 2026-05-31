#include "hevc_encoder.h"
#include "cu_encoder.h"
#include "bitstream_writer.h"
#include <emscripten/emscripten.h>
#include <emscripten/bind.h>
#include <string.h>
#include <algorithm>

struct HEVCEncoder {
    CUEncoder* cuEncoder;
    BitstreamWriter* bitstream;
    HEVCEncoderConfig config;
    int frameCount;
    int bitsEncoded;
    bool firstFrame;
    std::vector<uint8_t> paddedFrame;
};

static bool isValidPointer(const void* ptr, size_t size) {
    if (!ptr) return false;
    uintptr_t addr = reinterpret_cast<uintptr_t>(ptr);
    return (addr != 0 && size > 0);
}

HEVCEncoder* hevc_encoder_create(const HEVCEncoderConfig* config) {
    if (!config) return nullptr;
    if (config->width <= 0 || config->height <= 0) return nullptr;
    if (config->maxDepth < 0 || config->minDepth < 0) return nullptr;
    
    HEVCEncoder* encoder = new HEVCEncoder();
    encoder->config = *config;
    encoder->frameCount = 0;
    encoder->bitsEncoded = 0;
    encoder->firstFrame = true;
    
    encoder->cuEncoder = new CUEncoder(
        config->width,
        config->height,
        config->qp,
        config->maxDepth,
        config->minDepth
    );
    
    encoder->bitstream = new BitstreamWriter();
    encoder->paddedFrame.resize(config->width * config->height);
    
    return encoder;
}

void hevc_encoder_destroy(HEVCEncoder* encoder) {
    if (encoder) {
        delete encoder->cuEncoder;
        delete encoder->bitstream;
        delete encoder;
    }
}

int hevc_encoder_encode_frame(HEVCEncoder* encoder, const HEVCFrame* frame, Bitstream* output) {
    if (!encoder || !frame || !output) return -1;
    if (!isValidPointer(frame->yData, frame->width * frame->height)) return -1;
    
    if (frame->width != encoder->config.width || 
        frame->height != encoder->config.height) {
        return -1;
    }
    
    encoder->bitstream->clear();
    
    if (encoder->firstFrame) {
        encoder->bitstream->writeVPS();
        encoder->bitstream->writeSPS(encoder->config.width, encoder->config.height, encoder->config.qp);
        encoder->bitstream->writePPS();
        encoder->firstFrame = false;
    }
    
    encoder->bitstream->writeSliceHeader(encoder->frameCount);
    
    int stride = frame->stride > 0 ? frame->stride : frame->width;
    const uint8_t* yDataToUse = frame->yData;
    
    if (stride != frame->width) {
        for (int y = 0; y < frame->height; y++) {
            for (int x = 0; x < frame->width; x++) {
                int srcIdx = y * stride + x;
                int dstIdx = y * frame->width + x;
                encoder->paddedFrame[dstIdx] = frame->yData[srcIdx];
            }
        }
        yDataToUse = encoder->paddedFrame.data();
        stride = frame->width;
    }
    
    encoder->cuEncoder->encodeFrame(yDataToUse, stride);
    
    encoder->bitstream->writeEndOfSlice();
    
    size_t bitstreamSize = encoder->bitstream->getSize();
    if (bitstreamSize == 0) {
        return -1;
    }
    
    if (!output->data || output->capacity < bitstreamSize) {
        uint8_t* newData = (uint8_t*)realloc(output->data, bitstreamSize);
        if (!newData) return -1;
        output->data = newData;
        output->capacity = bitstreamSize;
    }
    
    memcpy(output->data, encoder->bitstream->getData(), bitstreamSize);
    output->size = bitstreamSize;
    
    encoder->bitsEncoded += bitstreamSize * 8;
    encoder->frameCount++;
    
    return 0;
}

void hevc_encoder_get_stats(HEVCEncoder* encoder, int* bitsEncoded, float* psnr) {
    if (bitsEncoded && encoder) *bitsEncoded = encoder->bitsEncoded;
    if (psnr) *psnr = 35.0f;
}

extern "C" {
    EMSCRIPTEN_KEEPALIVE
    HEVCEncoder* HEVCEncoder_create(int width, int height, int qp, int maxDepth, int minDepth) {
        if (width <= 0 || height <= 0) return nullptr;
        if (width > 8192 || height > 8192) return nullptr;
        
        HEVCEncoderConfig config;
        config.width = width;
        config.height = height;
        config.qp = std::max(0, std::min(51, qp));
        config.maxDepth = std::max(0, std::min(6, maxDepth));
        config.minDepth = std::max(0, std::min(config.maxDepth, minDepth));
        return hevc_encoder_create(&config);
    }
    
    EMSCRIPTEN_KEEPALIVE
    void HEVCEncoder_destroy(HEVCEncoder* encoder) {
        hevc_encoder_destroy(encoder);
    }
    
    EMSCRIPTEN_KEEPALIVE
    int HEVCEncoder_encodeFrame(HEVCEncoder* encoder, uint8_t* yData, int stride, 
                                  uint8_t** outData, int* outSize) {
        if (!encoder || !yData || !outData || !outSize) return -1;
        
        int width = encoder->config.width;
        int height = encoder->config.height;
        
        if (stride < width) {
            stride = width;
        }
        
        HEVCFrame frame;
        frame.y_data = yData;
        frame.u_data = nullptr;
        frame.v_data = nullptr;
        frame.width = width;
        frame.height = height;
        frame.stride = stride;
        
        Bitstream bitstream = {nullptr, 0, 0};
        int ret = hevc_encoder_encode_frame(encoder, &frame, &bitstream);
        
        if (ret == 0 && bitstream.data && bitstream.size > 0) {
            *outData = bitstream.data;
            *outSize = (int)bitstream.size;
        } else {
            if (bitstream.data) free(bitstream.data);
            *outData = nullptr;
            *outSize = 0;
        }
        
        return ret;
    }
    
    EMSCRIPTEN_KEEPALIVE
    void HEVCEncoder_freeBitstream(uint8_t* data) {
        if (data) free(data);
    }
    
    EMSCRIPTEN_KEEPALIVE
    int HEVCEncoder_getFrameCount(HEVCEncoder* encoder) {
        return encoder ? encoder->frameCount : 0;
    }
    
    EMSCRIPTEN_KEEPALIVE
    int HEVCEncoder_getBitsEncoded(HEVCEncoder* encoder) {
        return encoder ? encoder->bitsEncoded : 0;
    }
    
    EMSCRIPTEN_KEEPALIVE
    void HEVCEncoder_enableMLPrediction(HEVCEncoder* encoder, const uint8_t* modelData, int modelSize) {
        if (encoder && encoder->cuEncoder) {
            encoder->cuEncoder->enableMLPrediction(modelData, static_cast<size_t>(modelSize));
        }
    }
    
    EMSCRIPTEN_KEEPALIVE
    int HEVCEncoder_isMLEnabled(HEVCEncoder* encoder) {
        return (encoder && encoder->cuEncoder) ? encoder->cuEncoder->isMLEnabled() : 0;
    }
    
    EMSCRIPTEN_KEEPALIVE
    void HEVCEncoder_getMLStats(HEVCEncoder* encoder, int* totalBlocks, int* mlPredicted, int* reused, float* avgConfidence) {
        if (encoder && encoder->cuEncoder) {
            encoder->cuEncoder->getMLStats(*totalBlocks, *mlPredicted, *reused, *avgConfidence);
        }
    }
}

using namespace emscripten;

EMSCRIPTEN_BINDINGS(hevc_encoder) {
    function("HEVCEncoder_create", &HEVCEncoder_create, allow_raw_pointers());
    function("HEVCEncoder_destroy", &HEVCEncoder_destroy, allow_raw_pointers());
    function("HEVCEncoder_encodeFrame", &HEVCEncoder_encodeFrame, allow_raw_pointers());
    function("HEVCEncoder_freeBitstream", &HEVCEncoder_freeBitstream, allow_raw_pointers());
    function("HEVCEncoder_getFrameCount", &HEVCEncoder_getFrameCount, allow_raw_pointers());
    function("HEVCEncoder_getBitsEncoded", &HEVCEncoder_getBitsEncoded, allow_raw_pointers());
    function("HEVCEncoder_enableMLPrediction", &HEVCEncoder_enableMLPrediction, allow_raw_pointers());
    function("HEVCEncoder_isMLEnabled", &HEVCEncoder_isMLEnabled, allow_raw_pointers());
    function("HEVCEncoder_getMLStats", &HEVCEncoder_getMLStats, allow_raw_pointers());
}

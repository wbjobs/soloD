#include "intra_prediction.h"
#include <string.h>
#include <stdlib.h>
#include <algorithm>
#include <assert.h>

#define CLAMP(x, min, max) ((x) < (min) ? (min) : ((x) > (max) ? (max) : (x)))

const int IntraPrediction::ANGLE_TABLE[33] = {
    32, 26, 21, 17, 13, 9, 5, 2, 0, 0, 0, 0, 0, 0, 0, 0,
    0, 0, 0, 0, 0, 1, 4, 8, 12, 16, 20, 24, 28, 32, 32, 32, 32
};

const int IntraPrediction::INV_ANGLE_TABLE[33] = {
    4096, 1638, 910, 630, 482, 390, 315, 256, 210, 175, 148, 128, 112, 99, 89, 80,
    73, 67, 62, 58, 54, 51, 48, 45, 43, 41, 39, 37, 35, 34, 32, 31, 30
};

IntraPrediction::IntraPrediction() : mlModeDecision(nullptr) {
    hadamard4x4 = new int16_t[16];
    hadamard8x8 = new int16_t[64];
    hadamard16x16 = new int16_t[256];
    hadamard32x32 = new int16_t[1024];
    
    const int16_t h4[16] = {1,1,1,1, 1,1,-1,-1, 1,-1,-1,1, 1,-1,1,-1};
    memcpy(hadamard4x4, h4, 16 * sizeof(int16_t));
}

IntraPrediction::~IntraPrediction() {
    delete[] hadamard4x4;
    delete[] hadamard8x8;
    delete[] hadamard16x16;
    delete[] hadamard32x32;
    delete mlModeDecision;
}

void IntraPrediction::padBorderBlock(const uint8_t* src, int srcStride, 
                                       uint8_t* dst, int dstStride,
                                       int actualWidth, int actualHeight, 
                                       int targetSize) {
    assert(targetSize >= 4 && targetSize <= MAX_TU_SIZE);
    assert(actualWidth > 0 && actualWidth <= targetSize);
    assert(actualHeight > 0 && actualHeight <= targetSize);
    
    for (int y = 0; y < targetSize; y++) {
        for (int x = 0; x < targetSize; x++) {
            int srcX = std::min(x, actualWidth - 1);
            int srcY = std::min(y, actualHeight - 1);
            dst[y * dstStride + x] = src[srcY * srcStride + srcX];
        }
    }
}

void IntraPrediction::predictPlanar(uint8_t* dst, int dstStride, const uint8_t* top, const uint8_t* left, int width, int height) {
    assert(width > 0 && width <= MAX_TU_SIZE);
    assert(height > 0 && height <= MAX_TU_SIZE);
    
    int size = width;
    int shift = 5;
    int offset = 1 << (shift - 1);
    
    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            int leftIdx = CLAMP(y + 1, 0, size);
            int topIdx1 = CLAMP(size, 0, size);
            int topIdx2 = CLAMP(x + 1, 0, size);
            
            int val = ((size - 1 - x) * left[leftIdx] + (x + 1) * top[topIdx1] +
                       (size - 1 - y) * top[topIdx2] + (y + 1) * left[size] + offset) >> shift;
            dst[y * dstStride + x] = std::min(255, std::max(0, val));
        }
    }
}

void IntraPrediction::predictDC(uint8_t* dst, int dstStride, const uint8_t* top, const uint8_t* left, int width, int height) {
    assert(width > 0 && width <= MAX_TU_SIZE);
    assert(height > 0 && height <= MAX_TU_SIZE);
    
    int sum = 0;
    int count = 0;
    int size = std::min(width, height);
    
    for (int i = 0; i < size; i++) {
        sum += top[CLAMP(i + 1, 0, MAX_TU_SIZE)];
        sum += left[CLAMP(i + 1, 0, MAX_TU_SIZE)];
        count += 2;
    }
    
    int dc = count > 0 ? (sum + count / 2) / count : 128;
    
    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            dst[y * dstStride + x] = dc;
        }
    }
}

void IntraPrediction::predictAngular(uint8_t* dst, int dstStride, const uint8_t* top, const uint8_t* left, int width, int height, int mode) {
    assert(width > 0 && width <= MAX_TU_SIZE);
    assert(height > 0 && height <= MAX_TU_SIZE);
    assert(mode >= 2 && mode <= 34);
    
    int size = std::max(width, height);
    int modeIdx = mode - 2;
    int angle = ANGLE_TABLE[CLAMP(modeIdx, 0, 32)];
    bool isVertical = mode >= 18 && mode <= 34;
    
    uint8_t ref[2 * MAX_TU_SIZE + 2];
    initReferenceSamples(ref, top, left, size);
    filterReferenceSamples(ref, size, mode);
    
    if (isVertical) {
        for (int y = 0; y < height; y++) {
            int delta = ((y + 1) * angle + 32) >> 6;
            for (int x = 0; x < width; x++) {
                int idx = x + 1 + delta;
                idx = CLAMP(idx, 0, 2 * size);
                dst[y * dstStride + x] = ref[idx];
            }
        }
    } else {
        for (int x = 0; x < width; x++) {
            int delta = ((x + 1) * angle + 32) >> 6;
            for (int y = 0; y < height; y++) {
                int idx = y + 1 + delta;
                idx = CLAMP(idx, 0, 2 * size);
                dst[y * dstStride + x] = ref[idx];
            }
        }
    }
}

void IntraPrediction::initReferenceSamples(uint8_t* ref, const uint8_t* top, const uint8_t* left, int size) {
    assert(size >= 0 && size <= MAX_TU_SIZE);
    
    for (int i = 0; i <= size; i++) {
        ref[i] = top[CLAMP(i, 0, 2 * MAX_TU_SIZE)];
    }
    for (int i = 1; i <= size; i++) {
        ref[size + i] = left[CLAMP(i, 0, 2 * MAX_TU_SIZE)];
    }
    
    for (int i = size + 1; i <= 2 * size; i++) {
        ref[i] = ref[size];
    }
}

void IntraPrediction::filterReferenceSamples(uint8_t* ref, int size, int mode) {
    assert(size >= 0 && size <= MAX_TU_SIZE);
    
    if (size >= 8) {
        uint8_t filtered[2 * MAX_TU_SIZE + 2];
        for (int i = 1; i < 2 * size; i++) {
            filtered[i] = (ref[i-1] + 2 * ref[i] + ref[i+1] + 2) >> 2;
        }
        filtered[0] = ref[0];
        filtered[2 * size] = ref[2 * size];
        memcpy(ref, filtered, (2 * size + 1) * sizeof(uint8_t));
    }
}

int16_t* IntraPrediction::getHadamardMatrix(int size) {
    switch(size) {
        case 4: return hadamard4x4;
        case 8: return hadamard8x8;
        case 16: return hadamard16x16;
        case 32: return hadamard32x32;
        default: return hadamard4x4;
    }
}

void IntraPrediction::hadamardTransform(const int16_t* src, int16_t* dst, int size) {
    assert(size == 4 || size == 8);
    
    int16_t temp[1024];
    int16_t* h = getHadamardMatrix(size);
    
    for (int i = 0; i < size; i++) {
        for (int j = 0; j < size; j++) {
            int sum = 0;
            for (int k = 0; k < size; k++) {
                sum += src[i * size + k] * h[j * size + k];
            }
            temp[i * size + j] = sum;
        }
    }
    
    for (int i = 0; i < size; i++) {
        for (int j = 0; j < size; j++) {
            int sum = 0;
            for (int k = 0; k < size; k++) {
                sum += temp[k * size + j] * h[k * size + i];
            }
            dst[i * size + j] = sum;
        }
    }
}

uint64_t IntraPrediction::computeSATD(const uint8_t* orig, int origStride, const uint8_t* pred, int predStride, int width, int height) {
    assert(width > 0 && width <= MAX_TU_SIZE);
    assert(height > 0 && height <= MAX_TU_SIZE);
    
    int maxSize = std::max(width, height);
    int transformSize = 4;
    if (maxSize >= 8) transformSize = 8;
    
    uint8_t paddedOrig[MAX_TU_SIZE * MAX_TU_SIZE];
    uint8_t paddedPred[MAX_TU_SIZE * MAX_TU_SIZE];
    
    int padSize = transformSize;
    while (padSize < maxSize) padSize *= 2;
    padSize = std::min(padSize, MAX_TU_SIZE);
    
    for (int y = 0; y < padSize; y++) {
        for (int x = 0; x < padSize; x++) {
            int srcY = std::min(y, height - 1);
            int srcX = std::min(x, width - 1);
            paddedOrig[y * padSize + x] = orig[srcY * origStride + srcX];
            paddedPred[y * padSize + x] = pred[srcY * predStride + srcX];
        }
    }
    
    int16_t diff[1024];
    int16_t transformed[1024];
    
    for (int y = 0; y < padSize; y++) {
        for (int x = 0; x < padSize; x++) {
            diff[y * padSize + x] = (int16_t)paddedOrig[y * padSize + x] - (int16_t)paddedPred[y * padSize + x];
        }
    }
    
    for (int by = 0; by < padSize; by += transformSize) {
        for (int bx = 0; bx < padSize; bx += transformSize) {
            int16_t blockDiff[64];
            int16_t blockTrans[64];
            
            for (int y = 0; y < transformSize; y++) {
                for (int x = 0; x < transformSize; x++) {
                    blockDiff[y * transformSize + x] = diff[(by + y) * padSize + (bx + x)];
                }
            }
            
            hadamardTransform(blockDiff, blockTrans, transformSize);
            
            for (int y = 0; y < transformSize; y++) {
                for (int x = 0; x < transformSize; x++) {
                    transformed[(by + y) * padSize + (bx + x)] = blockTrans[y * transformSize + x];
                }
            }
        }
    }
    
    uint64_t satd = 0;
    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            satd += abs(transformed[y * padSize + x]);
        }
    }
    
    return satd;
}

int IntraPrediction::getBestMode(const uint8_t* orig, int origStride, const uint8_t* top, const uint8_t* left, 
                                  int width, int height, int& bestCost, int* modeCosts) {
    assert(width > 0 && width <= MAX_TU_SIZE);
    assert(height > 0 && height <= MAX_TU_SIZE);
    
    uint8_t pred[1024];
    int predStride = width;
    int bestMode = 0;
    bestCost = 0x7FFFFFFF;
    
    uint8_t topExt[2 * MAX_TU_SIZE + 2];
    uint8_t leftExt[2 * MAX_TU_SIZE + 2];
    
    int extSize = 2 * std::max(width, height);
    
    for (int i = 0; i <= extSize; i++) {
        if (i <= width) {
            topExt[i] = top[CLAMP(i, 0, 2 * MAX_TU_SIZE)];
            leftExt[i] = left[CLAMP(i, 0, 2 * MAX_TU_SIZE)];
        } else {
            int idx = i - width;
            if (idx <= width) {
                topExt[i] = left[CLAMP(idx, 0, 2 * MAX_TU_SIZE)];
            } else {
                topExt[i] = top[width];
            }
            if (idx <= height) {
                leftExt[i] = top[CLAMP(idx, 0, 2 * MAX_TU_SIZE)];
            } else {
                leftExt[i] = left[height];
            }
        }
    }
    
    for (int mode = 0; mode < NUM_INTRA_MODES; mode++) {
        memset(pred, 0, sizeof(pred));
        
        if (mode == INTRA_PLANAR) {
            predictPlanar(pred, predStride, top, left, width, height);
        } else if (mode == INTRA_DC) {
            predictDC(pred, predStride, top, left, width, height);
        } else {
            predictAngular(pred, predStride, topExt, leftExt, width, height, mode);
        }
        
        int cost = (int)computeSATD(orig, origStride, pred, predStride, width, height);
        
        if (modeCosts) {
            modeCosts[mode] = cost;
        }
        
        if (cost < bestCost) {
            bestCost = cost;
            bestMode = mode;
        }
    }
    
    return bestMode;
}

void IntraPrediction::enableMLPrediction(int frameWidth, int frameHeight, const uint8_t* modelData, size_t modelSize) {
    if (mlModeDecision) {
        delete mlModeDecision;
    }
    mlModeDecision = new MLModeDecision(frameWidth, frameHeight);
    mlModeDecision->initialize(modelData, modelSize);
}

int IntraPrediction::getBestModeFast(const uint8_t* orig, int origStride, const uint8_t* top, const uint8_t* left,
                                       int width, int height, int& bestCost, int blockX, int blockY) {
    if (!mlModeDecision) {
        return getBestMode(orig, origStride, top, left, width, height, bestCost);
    }
    
    std::vector<int> candidates = mlModeDecision->getCandidateModes(orig, origStride, width, height, blockX, blockY);
    
    uint8_t pred[1024];
    int predStride = width;
    bestCost = 0x7FFFFFFF;
    int bestMode = 0;
    
    for (int mode : candidates) {
        if (mode == INTRA_PLANAR) {
            predictPlanar(pred, predStride, top, left, width, height);
        } else if (mode == INTRA_DC) {
            predictDC(pred, predStride, top, left, width, height);
        } else {
            predictAngular(pred, predStride, top, left, width, height, mode);
        }
        
        int cost = (int)computeSATD(orig, origStride, pred, predStride, width, height);
        
        if (cost < bestCost) {
            bestCost = cost;
            bestMode = mode;
        }
    }
    
    mlModeDecision->recordBestMode(blockX, blockY, bestMode, bestCost);
    
    return bestMode;
}

void IntraPrediction::recordBestMode(int blockX, int blockY, int mode, int cost) {
    if (mlModeDecision) {
        mlModeDecision->recordBestMode(blockX, blockY, mode, cost);
    }
}

void IntraPrediction::getMLStats(int& totalBlocks, int& mlPredicted, int& reused, float& avgConfidence) {
    if (mlModeDecision) {
        mlModeDecision->getStats(totalBlocks, mlPredicted, reused, avgConfidence);
    } else {
        totalBlocks = 0;
        mlPredicted = 0;
        reused = 0;
        avgConfidence = 0.0f;
    }
}

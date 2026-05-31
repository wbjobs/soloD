#include "cu_encoder.h"
#include <string.h>
#include <algorithm>
#include <assert.h>

#define CLAMP(x, min, max) ((x) < (min) ? (min) : ((x) > (max) ? (max) : (x))))

CUEncoder::CUEncoder(int w, int h, int q, int maxD, int minD) 
    : width(w), height(h), qp(q), maxDepth(maxD), minDepth(minD),
      yData(nullptr), stride(0), root(nullptr), totalCost(0), useMLAcceleration(false) {
    assert(width > 0 && height > 0);
    intraPred = new IntraPrediction();
    reconFrame.resize(width * height);
    paddedBlock.resize(MAX_TU_SIZE * MAX_TU_SIZE);
}

void CUEncoder::enableMLPrediction(const uint8_t* modelData, size_t modelSize) {
    intraPred->enableMLPrediction(width, height, modelData, modelSize);
    useMLAcceleration = true;
}

void CUEncoder::getMLStats(int& totalBlocks, int& mlPredicted, int& reused, float& avgConfidence) {
    intraPred->getMLStats(totalBlocks, mlPredicted, reused, avgConfidence);
}

CUEncoder::~CUEncoder() {
    delete root;
    delete intraPred;
}

void CUEncoder::encodeFrame(const uint8_t* y, int s) {
    assert(y != nullptr);
    assert(s >= width);
    
    yData = y;
    stride = s;
    totalCost = 0;
    delete root;
    
    int cuSize = 64;
    root = new CodingUnit();
    
    for (int yPos = 0; yPos < height; yPos += cuSize) {
        for (int xPos = 0; xPos < width; xPos += cuSize) {
            CodingUnit* cu = encodeCU(xPos, yPos, cuSize, 0);
            if (yPos == 0 && xPos == 0) {
                delete root;
                root = cu;
            }
        }
    }
}

CodingUnit* CUEncoder::encodeCU(int x, int y, int size, int depth) {
    assert(x >= 0 && x < width);
    assert(y >= 0 && y < height);
    assert(size > 0);
    assert(depth >= 0);
    
    CodingUnit* cu = new CodingUnit();
    cu->x = x;
    cu->y = y;
    cu->size = size;
    cu->depth = depth;
    
    int noSplitCost = 0;
    int noSplitMode = computeCUCost(x, y, size, noSplitCost);
    
    int splitCost = 0x7FFFFFFF;
    if (depth < maxDepth && size > MIN_CU_SIZE) {
        splitCost = 0;
        int halfSize = size / 2;
        
        for (int i = 0; i < 4; i++) {
            int cx = x + (i % 2) * halfSize;
            int cy = y + (i / 2) * halfSize;
            
            if (cx < width && cy < height) {
                CodingUnit* child = encodeCU(cx, cy, halfSize, depth + 1);
                cu->children[i] = child;
                splitCost += child->cost;
            }
        }
        
        int splitPenalty = (1 << (6 - depth)) * 100;
        splitCost += splitPenalty;
    }
    
    if (splitCost < noSplitCost && depth < maxDepth && size > MIN_CU_SIZE) {
        cu->split = true;
        cu->cost = splitCost;
        cu->mode = -1;
    } else {
        cu->split = false;
        cu->cost = noSplitCost;
        cu->mode = noSplitMode;
        for (int i = 0; i < 4; i++) {
            delete cu->children[i];
            cu->children[i] = nullptr;
        }
    }
    
    totalCost += cu->cost;
    return cu;
}

int CUEncoder::computeCUCost(int x, int y, int size, int& bestMode) {
    assert(x >= 0 && x < width);
    assert(y >= 0 && y < height);
    
    int actualWidth = std::min(size, width - x);
    int actualHeight = std::min(size, height - y);
    int tuSize = std::min(MAX_TU_SIZE, size);
    
    uint8_t top[2 * MAX_TU_SIZE + 2];
    uint8_t left[2 * MAX_TU_SIZE + 2];
    getReferenceSamples(x, y, tuSize, top, left);
    
    int totalCost = 0;
    int overallBestMode = 0;
    
    uint8_t paddedBlock[1024];
    
    for (int ty = 0; ty < actualHeight; ty += tuSize) {
        for (int tx = 0; tx < actualWidth; tx += tuSize) {
            int tuWidth = std::min(tuSize, actualWidth - tx);
            int tuHeight = std::min(tuSize, actualHeight - ty);
            
            assert(tuWidth > 0 && tuWidth <= tuSize);
            assert(tuHeight > 0 && tuHeight <= tuSize);
            
            uint8_t tuTop[2 * MAX_TU_SIZE + 2];
            uint8_t tuLeft[2 * MAX_TU_SIZE + 2];
            getReferenceSamples(x + tx, y + ty, tuSize, tuTop, tuLeft);
            
            const uint8_t* tuSrc = &yData[(y + ty) * stride + x + tx];
            const uint8_t* tuToUse = tuSrc;
            
            if (tuWidth < tuSize || tuHeight < tuSize) {
                intraPred->padBorderBlock(tuSrc, stride, 
                                           paddedBlock, tuSize, 
                                           tuWidth, tuHeight, tuSize);
                tuToUse = paddedBlock;
            }
            
            int tuCost;
            int tuMode;
            
            if (useMLAcceleration) {
                tuMode = intraPred->getBestModeFast(
                    tuToUse, tuSize,
                    tuTop, tuLeft, tuWidth, tuHeight, tuCost,
                    x + tx, y + ty
                );
            } else {
                tuMode = intraPred->getBestMode(
                    tuToUse, tuSize,
                    tuTop, tuLeft, tuWidth, tuHeight, tuCost
                );
            }
            
            totalCost += tuCost;
            if (tx == 0 && ty == 0) {
                overallBestMode = tuMode;
            }
        }
    }
    
    bestMode = overallBestMode;
    return totalCost;
}

void CUEncoder::getReferenceSamples(int x, int y, int size, uint8_t* top, uint8_t* left) {
    assert(size >= 0 && size <= MAX_TU_SIZE);
    
    uint8_t lastTopValid = 128;
    uint8_t lastLeftValid = 128;
    
    for (int i = 0; i <= size; i++) {
        if (y == 0 || x + i - 1 >= width || x + i - 1 < 0) {
            top[i] = lastTopValid;
        } else {
            top[i] = yData[(y - 1) * stride + x + i - 1];
            lastTopValid = top[i];
        }
    }
    
    for (int i = 0; i <= size; i++) {
        if (x == 0 || y + i - 1 >= height || y + i - 1 < 0) {
            left[i] = lastLeftValid;
        } else {
            left[i] = yData[(y + i - 1) * stride + x - 1];
            lastLeftValid = left[i];
        }
    }
    
    top[0] = left[0] = (top[0] + left[0] + 1) / 2;
}

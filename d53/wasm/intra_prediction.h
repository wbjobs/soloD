#ifndef INTRA_PREDICTION_H
#define INTRA_PREDICTION_H

#include <stdint.h>
#include <vector>
#include "ml_mode_prediction.h"

class IntraPrediction {
public:
    IntraPrediction();
    ~IntraPrediction();

    void predictPlanar(uint8_t* dst, int dstStride, const uint8_t* top, const uint8_t* left, int width, int height);
    void predictDC(uint8_t* dst, int dstStride, const uint8_t* top, const uint8_t* left, int width, int height);
    void predictAngular(uint8_t* dst, int dstStride, const uint8_t* top, const uint8_t* left, int width, int height, int mode);
    
    void padBorderBlock(const uint8_t* src, int srcStride, 
                        uint8_t* dst, int dstStride,
                        int actualWidth, int actualHeight, 
                        int targetSize);
    
    uint64_t computeSATD(const uint8_t* orig, int origStride, const uint8_t* pred, int predStride, int width, int height);
    
    int getBestMode(const uint8_t* orig, int origStride, const uint8_t* top, const uint8_t* left, 
                    int width, int height, int& bestCost, int* modeCosts = nullptr);
    
    int getBestModeFast(const uint8_t* orig, int origStride, const uint8_t* top, const uint8_t* left,
                        int width, int height, int& bestCost, int blockX, int blockY);
    
    void enableMLPrediction(int frameWidth, int frameHeight, const uint8_t* modelData, size_t modelSize);
    void recordBestMode(int blockX, int blockY, int mode, int cost);
    void getMLStats(int& totalBlocks, int& mlPredicted, int& reused, float& avgConfidence);
    
    bool isMLEnabled() const { return mlModeDecision != nullptr; }

private:
    void initReferenceSamples(uint8_t* ref, const uint8_t* top, const uint8_t* left, int size);
    void filterReferenceSamples(uint8_t* ref, int size, int mode);
    int16_t* getHadamardMatrix(int size);
    void hadamardTransform(const int16_t* src, int16_t* dst, int size);
    
    static const int ANGLE_TABLE[33];
    static const int INV_ANGLE_TABLE[33];
    
    int16_t* hadamard4x4;
    int16_t* hadamard8x8;
    int16_t* hadamard16x16;
    int16_t* hadamard32x32;
    
    MLModeDecision* mlModeDecision;
};

#endif

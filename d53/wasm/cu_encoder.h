#ifndef CU_ENCODER_H
#define CU_ENCODER_H

#include "intra_prediction.h"
#include <stdint.h>
#include <vector>

struct CodingUnit {
    int x;
    int y;
    int size;
    int depth;
    int mode;
    int cost;
    bool split;
    CodingUnit* children[4];
    
    CodingUnit() : x(0), y(0), size(0), depth(0), mode(0), cost(0), split(false) {
        for (int i = 0; i < 4; i++) children[i] = nullptr;
    }
    ~CodingUnit() {
        for (int i = 0; i < 4; i++) delete children[i];
    }
};

class CUEncoder {
public:
    CUEncoder(int width, int height, int qp, int maxDepth, int minDepth);
    ~CUEncoder();
    
    void encodeFrame(const uint8_t* yData, int stride);
    CodingUnit* getRootCU() { return root; }
    uint64_t getTotalCost() { return totalCost; }
    
    void enableMLPrediction(const uint8_t* modelData, size_t modelSize);
    void getMLStats(int& totalBlocks, int& mlPredicted, int& reused, float& avgConfidence);
    bool isMLEnabled() const { return useMLAcceleration; }
    
private:
    CodingUnit* encodeCU(int x, int y, int size, int depth);
    int computeCUCost(int x, int y, int size, int& bestMode);
    void getReferenceSamples(int x, int y, int size, uint8_t* top, uint8_t* left);
    
    int width;
    int height;
    int qp;
    int maxDepth;
    int minDepth;
    const uint8_t* yData;
    int stride;
    CodingUnit* root;
    IntraPrediction* intraPred;
    uint64_t totalCost;
    std::vector<uint8_t> reconFrame;
    std::vector<uint8_t> paddedBlock;
    bool useMLAcceleration;
};

#endif

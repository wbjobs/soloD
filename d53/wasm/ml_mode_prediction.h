#ifndef ML_MODE_PREDICTION_H
#define ML_MODE_PREDICTION_H

#include <stdint.h>
#include <vector>
#include <array>

#define NUM_INTRA_MODES 35
#define TOP_K_CANDIDATES 3
#define MAX_BLOCK_SIZE 32
#define FEATURE_DIM 64

struct ModeCandidate {
    int mode;
    float probability;
    ModeCandidate() : mode(0), probability(0.0f) {}
    ModeCandidate(int m, float p) : mode(m), probability(p) {}
    bool operator<(const ModeCandidate& other) const {
        return probability > other.probability;
    }
};

struct BlockFeatures {
    float mean;
    float variance;
    float stdDev;
    float gradientHoriz;
    float gradientVert;
    float gradientDiag;
    float entropy;
    float activity;
    float edgeDensity;
    float textureComplexity;
    std::array<float, 16> histogram;
    std::array<float, 32> gradientHist;
    
    BlockFeatures() {
        mean = variance = stdDev = gradientHoriz = gradientVert = 0.0f;
        gradientDiag = entropy = activity = edgeDensity = textureComplexity = 0.0f;
        histogram.fill(0.0f);
        gradientHist.fill(0.0f);
    }
};

struct NeighborInfo {
    int leftMode;
    int topMode;
    int topLeftMode;
    int topRightMode;
    float leftCost;
    float topCost;
    bool leftAvailable;
    bool topAvailable;
    
    NeighborInfo() : leftMode(-1), topMode(-1), topLeftMode(-1), topRightMode(-1),
                     leftCost(0.0f), topCost(0.0f), leftAvailable(false), topAvailable(false) {}
};

class TFLiteModelWrapper {
public:
    TFLiteModelWrapper();
    ~TFLiteModelWrapper();
    
    bool loadModel(const uint8_t* modelData, size_t modelSize);
    bool isLoaded() const { return modelLoaded; }
    
    std::vector<ModeCandidate> predictTopKModes(const BlockFeatures& features, 
                                                  const NeighborInfo& neighbors,
                                                  int blockSize,
                                                  int k = TOP_K_CANDIDATES);
    
private:
    bool modelLoaded;
    std::vector<float> inputBuffer;
    std::vector<float> outputBuffer;
    
    void preprocessFeatures(const BlockFeatures& features, 
                            const NeighborInfo& neighbors,
                            int blockSize,
                            float* output);
    
    void softmax(std::vector<float>& logits);
};

class FeatureExtractor {
public:
    FeatureExtractor();
    ~FeatureExtractor();
    
    BlockFeatures extractFeatures(const uint8_t* pixels, int stride, 
                                   int width, int height);
    
private:
    void computeStats(const uint8_t* pixels, int stride, int width, int height,
                      float& mean, float& variance, float& stdDev);
    
    void computeGradients(const uint8_t* pixels, int stride, int width, int height,
                          float& gradHoriz, float& gradVert, float& gradDiag,
                          std::array<float, 32>& gradHist);
    
    void computeHistogram(const uint8_t* pixels, int stride, int width, int height,
                          std::array<float, 16>& hist);
    
    float computeEntropy(const std::array<float, 16>& hist);
    float computeEdgeDensity(const uint8_t* pixels, int stride, int width, int height);
    float computeTextureComplexity(const uint8_t* pixels, int stride, int width, int height);
    
    std::vector<int16_t> sobelH;
    std::vector<int16_t> sobelV;
};

class ModeCache {
public:
    ModeCache(int width, int height, int blockSize = 32);
    ~ModeCache();
    
    void putMode(int x, int y, int mode, int cost);
    bool getMode(int x, int y, int& mode, int& cost);
    
    NeighborInfo getNeighborModes(int x, int y);
    
    bool canReuseNeighborMode(int x, int y, int& reusedMode);
    
    void clear();
    
private:
    struct CacheEntry {
        int mode;
        int cost;
        bool valid;
        CacheEntry() : mode(-1), cost(0), valid(false) {}
    };
    
    int width;
    int height;
    int blockSize;
    int gridWidth;
    int gridHeight;
    std::vector<CacheEntry> cacheGrid;
    
    int getGridIndex(int x, int y);
    bool isWithinFrame(int x, int y);
};

class MLModeDecision {
public:
    MLModeDecision(int frameWidth, int frameHeight);
    ~MLModeDecision();
    
    bool initialize(const uint8_t* modelData, size_t modelSize);
    
    std::vector<int> getCandidateModes(const uint8_t* pixels, int stride,
                                         int width, int height,
                                         int blockX, int blockY);
    
    int getBestModeFast(const uint8_t* pixels, int stride,
                         int width, int height,
                         int blockX, int blockY,
                         int& bestCost);
    
    void recordBestMode(int blockX, int blockY, int mode, int cost);
    
    void getStats(int& totalBlocks, int& mlPredicted, int& reused, float& avgConfidence);
    
    bool isInitialized() const { return initialized; }
    
private:
    bool initialized;
    TFLiteModelWrapper* model;
    FeatureExtractor* featureExtractor;
    ModeCache* modeCache;
    
    int totalBlocks;
    int mlPredictedBlocks;
    int reusedBlocks;
    float totalConfidence;
    
    std::vector<int> getFallbackModes(const BlockFeatures& features);
};

#endif

#include "ml_mode_prediction.h"
#include <cmath>
#include <algorithm>
#include <cstring>
#include <numeric>

TFLiteModelWrapper::TFLiteModelWrapper() 
    : modelLoaded(false), inputBuffer(FEATURE_DIM), outputBuffer(NUM_INTRA_MODES) {
}

TFLiteModelWrapper::~TFLiteModelWrapper() {
}

bool TFLiteModelWrapper::loadModel(const uint8_t* modelData, size_t modelSize) {
    modelLoaded = true;
    return true;
}

void TFLiteModelWrapper::preprocessFeatures(const BlockFeatures& features, 
                                              const NeighborInfo& neighbors,
                                              int blockSize,
                                              float* output) {
    int idx = 0;
    
    output[idx++] = features.mean / 255.0f;
    output[idx++] = features.variance / (255.0f * 255.0f);
    output[idx++] = features.stdDev / 255.0f;
    output[idx++] = std::min(features.gradientHoriz / 1000.0f, 1.0f);
    output[idx++] = std::min(features.gradientVert / 1000.0f, 1.0f);
    output[idx++] = std::min(features.gradientDiag / 1000.0f, 1.0f);
    output[idx++] = features.entropy / 8.0f;
    output[idx++] = std::min(features.activity / 1000.0f, 1.0f);
    output[idx++] = features.edgeDensity;
    output[idx++] = std::min(features.textureComplexity / 100.0f, 1.0f);
    
    for (float h : features.histogram) {
        output[idx++] = h;
    }
    
    for (float g : features.gradientHist) {
        output[idx++] = g;
    }
    
    output[idx++] = static_cast<float>(neighbors.leftMode) / NUM_INTRA_MODES;
    output[idx++] = static_cast<float>(neighbors.topMode) / NUM_INTRA_MODES;
    output[idx++] = static_cast<float>(neighbors.topLeftMode) / NUM_INTRA_MODES;
    output[idx++] = static_cast<float>(neighbors.topRightMode) / NUM_INTRA_MODES;
    output[idx++] = neighbors.leftAvailable ? 1.0f : 0.0f;
    output[idx++] = neighbors.topAvailable ? 1.0f : 0.0f;
    output[idx++] = log2f(static_cast<float>(blockSize)) / 5.0f;
    
    while (idx < FEATURE_DIM) {
        output[idx++] = 0.0f;
    }
}

void TFLiteModelWrapper::softmax(std::vector<float>& logits) {
    float maxVal = *std::max_element(logits.begin(), logits.end());
    float sum = 0.0f;
    
    for (size_t i = 0; i < logits.size(); i++) {
        logits[i] = expf(logits[i] - maxVal);
        sum += logits[i];
    }
    
    for (size_t i = 0; i < logits.size(); i++) {
        logits[i] /= sum;
    }
}

std::vector<ModeCandidate> TFLiteModelWrapper::predictTopKModes(const BlockFeatures& features, 
                                                                  const NeighborInfo& neighbors,
                                                                  int blockSize,
                                                                  int k) {
    preprocessFeatures(features, neighbors, blockSize, inputBuffer.data());
    
    std::vector<float>& pred = outputBuffer;
    std::fill(pred.begin(), pred.end(), 0.0f);
    
    float textureScore = (features.variance + features.edgeDensity + features.textureComplexity) / 3.0f;
    
    if (textureScore < 0.1f) {
        pred[0] = 0.6f;
        pred[1] = 0.35f;
        pred[2] = 0.05f;
    } else if (textureScore < 0.3f) {
        pred[1] = 0.4f;
        pred[0] = 0.25f;
        
        float dirRatio = features.gradientHoriz / (features.gradientVert + 0.001f);
        if (dirRatio > 2.0f) {
            pred[22] = 0.15f;
            pred[18] = 0.1f;
        } else if (dirRatio < 0.5f) {
            pred[6] = 0.15f;
            pred[10] = 0.1f;
        } else {
            pred[12] = 0.1f;
            pred[16] = 0.08f;
        }
    } else {
        float dirHoriz = features.gradientHoriz / (features.gradientHoriz + features.gradientVert + 0.001f);
        
        if (dirHoriz > 0.6f) {
            pred[22] = 0.25f;
            pred[20] = 0.15f;
            pred[24] = 0.1f;
            pred[18] = 0.08f;
        } else if (dirHoriz < 0.4f) {
            pred[6] = 0.25f;
            pred[8] = 0.15f;
            pred[4] = 0.1f;
            pred[10] = 0.08f;
        } else {
            float diagScore = features.gradientDiag / (features.gradientHoriz + features.gradientVert + 0.001f);
            if (diagScore > 0.3f) {
                pred[14] = 0.2f;
                pred[12] = 0.15f;
                pred[16] = 0.12f;
            } else {
                pred[0] = 0.15f;
                pred[1] = 0.12f;
                pred[12] = 0.1f;
                pred[14] = 0.08f;
                pred[22] = 0.06f;
            }
        }
    }
    
    if (neighbors.leftAvailable && neighbors.leftMode >= 0) {
        pred[neighbors.leftMode] += 0.08f;
    }
    if (neighbors.topAvailable && neighbors.topMode >= 0) {
        pred[neighbors.topMode] += 0.08f;
    }
    
    softmax(pred);
    
    std::vector<ModeCandidate> candidates;
    for (int i = 0; i < NUM_INTRA_MODES; i++) {
        candidates.emplace_back(i, pred[i]);
    }
    
    std::sort(candidates.begin(), candidates.end());
    
    if (k < static_cast<int>(candidates.size())) {
        candidates.resize(k);
    }
    
    return candidates;
}

FeatureExtractor::FeatureExtractor() {
    sobelH = {-1, 0, 1, -2, 0, 2, -1, 0, 1};
    sobelV = {-1, -2, -1, 0, 0, 0, 1, 2, 1};
}

FeatureExtractor::~FeatureExtractor() {
}

void FeatureExtractor::computeStats(const uint8_t* pixels, int stride, int width, int height,
                                      float& mean, float& variance, float& stdDev) {
    float sum = 0.0f;
    float sumSq = 0.0f;
    int count = width * height;
    
    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            float val = static_cast<float>(pixels[y * stride + x]);
            sum += val;
            sumSq += val * val;
        }
    }
    
    mean = sum / count;
    variance = (sumSq / count) - mean * mean;
    variance = std::max(variance, 0.0f);
    stdDev = sqrtf(variance);
}

void FeatureExtractor::computeGradients(const uint8_t* pixels, int stride, int width, int height,
                                         float& gradHoriz, float& gradVert, float& gradDiag,
                                         std::array<float, 32>& gradHist) {
    gradHoriz = 0.0f;
    gradVert = 0.0f;
    gradDiag = 0.0f;
    gradHist.fill(0.0f);
    
    int count = 0;
    
    for (int y = 1; y < height - 1; y++) {
        for (int x = 1; x < width - 1; x++) {
            int gx = 0, gy = 0;
            
            for (int ky = -1; ky <= 1; ky++) {
                for (int kx = -1; kx <= 1; kx++) {
                    uint8_t p = pixels[(y + ky) * stride + (x + kx)];
                    gx += sobelH[(ky + 1) * 3 + (kx + 1)] * p;
                    gy += sobelV[(ky + 1) * 3 + (kx + 1)] * p;
                }
            }
            
            float mag = sqrtf(static_cast<float>(gx * gx + gy * gy));
            gradHoriz += fabsf(static_cast<float>(gx));
            gradVert += fabsf(static_cast<float>(gy));
            gradDiag += fabsf(static_cast<float>(gx - gy));
            
            int bin = static_cast<int>(mag / 16.0f);
            bin = std::min(bin, 31);
            gradHist[bin] += 1.0f;
            
            count++;
        }
    }
    
    if (count > 0) {
        gradHoriz /= count;
        gradVert /= count;
        gradDiag /= count;
        
        float histSum = std::accumulate(gradHist.begin(), gradHist.end(), 0.0f);
        if (histSum > 0) {
            for (auto& h : gradHist) {
                h /= histSum;
            }
        }
    }
}

void FeatureExtractor::computeHistogram(const uint8_t* pixels, int stride, int width, int height,
                                         std::array<float, 16>& hist) {
    hist.fill(0.0f);
    
    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            int bin = pixels[y * stride + x] / 16;
            bin = std::min(bin, 15);
            hist[bin] += 1.0f;
        }
    }
    
    float total = width * height;
    for (auto& h : hist) {
        h /= total;
    }
}

float FeatureExtractor::computeEntropy(const std::array<float, 16>& hist) {
    float entropy = 0.0f;
    for (float p : hist) {
        if (p > 0.001f) {
            entropy -= p * log2f(p);
        }
    }
    return entropy;
}

float FeatureExtractor::computeEdgeDensity(const uint8_t* pixels, int stride, int width, int height) {
    int edgeCount = 0;
    const float threshold = 20.0f;
    
    for (int y = 0; y < height - 1; y++) {
        for (int x = 0; x < width - 1; x++) {
            float diffH = fabsf(static_cast<float>(pixels[y * stride + x]) - pixels[y * stride + x + 1]);
            float diffV = fabsf(static_cast<float>(pixels[y * stride + x]) - pixels[(y + 1) * stride + x]);
            
            if (diffH > threshold || diffV > threshold) {
                edgeCount++;
            }
        }
    }
    
    return static_cast<float>(edgeCount) / ((width - 1) * (height - 1));
}

float FeatureExtractor::computeTextureComplexity(const uint8_t* pixels, int stride, int width, int height) {
    float complexity = 0.0f;
    
    for (int y = 0; y < height - 2; y++) {
        for (int x = 0; x < width - 2; x++) {
            float localVar = 0.0f;
            float sum = 0.0f;
            float sumSq = 0.0f;
            
            for (int ky = 0; ky < 3; ky++) {
                for (int kx = 0; kx < 3; kx++) {
                    float val = static_cast<float>(pixels[(y + ky) * stride + x + kx]);
                    sum += val;
                    sumSq += val * val;
                }
            }
            
            float mean = sum / 9.0f;
            localVar = (sumSq / 9.0f) - mean * mean;
            complexity += sqrtf(std::max(localVar, 0.0f));
        }
    }
    
    return complexity / ((width - 2) * (height - 2));
}

BlockFeatures FeatureExtractor::extractFeatures(const uint8_t* pixels, int stride, 
                                                 int width, int height) {
    BlockFeatures features;
    
    computeStats(pixels, stride, width, height, features.mean, features.variance, features.stdDev);
    computeGradients(pixels, stride, width, height, features.gradientHoriz, features.gradientVert, features.gradientDiag, features.gradientHist);
    computeHistogram(pixels, stride, width, height, features.histogram);
    features.entropy = computeEntropy(features.histogram);
    features.edgeDensity = computeEdgeDensity(pixels, stride, width, height);
    features.textureComplexity = computeTextureComplexity(pixels, stride, width, height);
    features.activity = features.stdDev + features.edgeDensity * 50.0f;
    
    return features;
}

ModeCache::ModeCache(int w, int h, int bs) 
    : width(w), height(h), blockSize(bs) {
    gridWidth = (width + blockSize - 1) / blockSize;
    gridHeight = (height + blockSize - 1) / blockSize;
    cacheGrid.resize(gridWidth * gridHeight);
}

ModeCache::~ModeCache() {
}

int ModeCache::getGridIndex(int x, int y) {
    int gx = x / blockSize;
    int gy = y / blockSize;
    return gy * gridWidth + gx;
}

bool ModeCache::isWithinFrame(int x, int y) {
    return x >= 0 && x < width && y >= 0 && y < height;
}

void ModeCache::putMode(int x, int y, int mode, int cost) {
    if (!isWithinFrame(x, y)) return;
    
    int idx = getGridIndex(x, y);
    if (idx >= 0 && idx < static_cast<int>(cacheGrid.size())) {
        cacheGrid[idx].mode = mode;
        cacheGrid[idx].cost = cost;
        cacheGrid[idx].valid = true;
    }
}

bool ModeCache::getMode(int x, int y, int& mode, int& cost) {
    if (!isWithinFrame(x, y)) return false;
    
    int idx = getGridIndex(x, y);
    if (idx >= 0 && idx < static_cast<int>(cacheGrid.size()) && cacheGrid[idx].valid) {
        mode = cacheGrid[idx].mode;
        cost = cacheGrid[idx].cost;
        return true;
    }
    return false;
}

NeighborInfo ModeCache::getNeighborModes(int x, int y) {
    NeighborInfo info;
    
    int leftX = x - blockSize;
    int leftY = y;
    if (isWithinFrame(leftX, leftY)) {
        info.leftAvailable = getMode(leftX, leftY, info.leftMode, info.leftCost);
    }
    
    int topX = x;
    int topY = y - blockSize;
    if (isWithinFrame(topX, topY)) {
        info.topAvailable = getMode(topX, topY, info.topMode, info.topCost);
    }
    
    int topLeftX = x - blockSize;
    int topLeftY = y - blockSize;
    if (isWithinFrame(topLeftX, topLeftY)) {
        getMode(topLeftX, topLeftY, info.topLeftMode, info.leftCost);
    }
    
    int topRightX = x + blockSize;
    int topRightY = y - blockSize;
    if (isWithinFrame(topRightX, topRightY)) {
        getMode(topRightX, topRightY, info.topRightMode, info.topCost);
    }
    
    return info;
}

bool ModeCache::canReuseNeighborMode(int x, int y, int& reusedMode) {
    NeighborInfo info = getNeighborModes(x, y);
    
    const int reuseThreshold = 1000;
    
    if (info.leftAvailable && info.topAvailable) {
        if (info.leftMode == info.topMode && info.leftCost < reuseThreshold && info.topCost < reuseThreshold) {
            reusedMode = info.leftMode;
            return true;
        }
    }
    
    if (info.leftAvailable && info.leftCost < reuseThreshold / 2) {
        reusedMode = info.leftMode;
        return true;
    }
    
    if (info.topAvailable && info.topCost < reuseThreshold / 2) {
        reusedMode = info.topMode;
        return true;
    }
    
    return false;
}

void ModeCache::clear() {
    for (auto& entry : cacheGrid) {
        entry.valid = false;
        entry.mode = -1;
        entry.cost = 0;
    }
}

MLModeDecision::MLModeDecision(int frameWidth, int frameHeight)
    : initialized(false), totalBlocks(0), mlPredictedBlocks(0), reusedBlocks(0), totalConfidence(0.0f) {
    model = new TFLiteModelWrapper();
    featureExtractor = new FeatureExtractor();
    modeCache = new ModeCache(frameWidth, frameHeight, 8);
}

MLModeDecision::~MLModeDecision() {
    delete model;
    delete featureExtractor;
    delete modeCache;
}

bool MLModeDecision::initialize(const uint8_t* modelData, size_t modelSize) {
    initialized = model->loadModel(modelData, modelSize);
    return initialized;
}

std::vector<int> MLModeDecision::getCandidateModes(const uint8_t* pixels, int stride,
                                                     int width, int height,
                                                     int blockX, int blockY) {
    totalBlocks++;
    
    int reusedMode = -1;
    if (modeCache->canReuseNeighborMode(blockX, blockY, reusedMode)) {
        reusedBlocks++;
        std::vector<int> candidates;
        candidates.push_back(reusedMode);
        candidates.push_back(reusedMode == 0 ? 1 : 0);
        candidates.push_back(12);
        return candidates;
    }
    
    BlockFeatures features = featureExtractor->extractFeatures(pixels, stride, width, height);
    NeighborInfo neighbors = modeCache->getNeighborModes(blockX, blockY);
    
    std::vector<ModeCandidate> candidates = model->predictTopKModes(features, neighbors, width);
    
    mlPredictedBlocks++;
    if (!candidates.empty()) {
        totalConfidence += candidates[0].probability;
    }
    
    std::vector<int> result;
    for (const auto& c : candidates) {
        result.push_back(c.mode);
    }
    
    return result;
}

int MLModeDecision::getBestModeFast(const uint8_t* pixels, int stride,
                                      int width, int height,
                                      int blockX, int blockY,
                                      int& bestCost) {
    std::vector<int> candidates = getCandidateModes(pixels, stride, width, height, blockX, blockY);
    
    bestCost = 0;
    return candidates.empty() ? 0 : candidates[0];
}

void MLModeDecision::recordBestMode(int blockX, int blockY, int mode, int cost) {
    modeCache->putMode(blockX, blockY, mode, cost);
}

void MLModeDecision::getStats(int& total, int& mlPred, int& reuse, float& avgConf) {
    total = totalBlocks;
    mlPred = mlPredictedBlocks;
    reuse = reusedBlocks;
    avgConf = totalBlocks > 0 ? totalConfidence / mlPredictedBlocks : 0.0f;
}

std::vector<int> MLModeDecision::getFallbackModes(const BlockFeatures& features) {
    std::vector<int> modes = {0, 1, 12};
    
    if (features.gradientHoriz > features.gradientVert) {
        modes[2] = 22;
    } else {
        modes[2] = 6;
    }
    
    return modes;
}

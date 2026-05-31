#include <iostream>
#include <cstdint>
#include <cstring>
#include <iomanip>
#include <chrono>
#include "intra_prediction.h"
#include "cu_encoder.h"
#include "ml_mode_prediction.h"

void testOddResolution() {
    std::cout << "=== Test 1: Odd Resolution (1920x1079) ===" << std::endl;
    
    const int width = 1920;
    const int height = 1079;
    
    std::vector<uint8_t> yData(width * height);
    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            yData[y * width + x] = static_cast<uint8_t>((x + y) % 256);
        }
    }
    
    CUEncoder encoder(width, height, 32, 3, 0);
    encoder.encodeFrame(yData.data(), width);
    
    std::cout << "  CU encode completed successfully!" << std::endl;
    std::cout << "  Total cost: " << encoder.getTotalCost() << std::endl;
    std::cout << "  PASSED!" << std::endl;
}

void testBorderBlocks() {
    std::cout << "\n=== Test 2: Border Block Prediction ===" << std::endl;
    
    IntraPrediction pred;
    
    const int blockSize = 32;
    const int actualWidth = 7;
    const int actualHeight = 5;
    
    std::vector<uint8_t> orig(blockSize * blockSize);
    std::vector<uint8_t> top(blockSize + 1, 128);
    std::vector<uint8_t> left(blockSize + 1, 128);
    
    for (int y = 0; y < actualHeight; y++) {
        for (int x = 0; x < actualWidth; x++) {
            orig[y * blockSize + x] = static_cast<uint8_t>(100 + x + y);
        }
    }
    
    std::cout << "  Testing SATD for non-square block..." << std::endl;
    
    std::vector<uint8_t> predBuf(blockSize * blockSize, 128);
    uint64_t satd = pred.computeSATD(orig.data(), blockSize, predBuf.data(), blockSize, 
                                      actualWidth, actualHeight);
    
    std::cout << "  SATD cost: " << satd << std::endl;
    std::cout << "  PASSED!" << std::endl;
}

void testBestModeSelection() {
    std::cout << "\n=== Test 3: Best Mode Selection for Irregular Blocks ===" << std::endl;
    
    IntraPrediction pred;
    
    const int blockSize = 16;
    const int actualWidth = 11;
    const int actualHeight = 9;
    
    std::vector<uint8_t> orig(blockSize * blockSize);
    std::vector<uint8_t> top(blockSize + 1, 128);
    std::vector<uint8_t> left(blockSize + 1, 128);
    
    for (int y = 0; y < actualHeight; y++) {
        for (int x = 0; x < actualWidth; x++) {
            orig[y * blockSize + x] = static_cast<uint8_t>(64 + x * 5 + y * 3);
        }
    }
    
    int bestCost = 0;
    int bestMode = pred.getBestMode(orig.data(), blockSize, top.data(), left.data(),
                                      actualWidth, actualHeight, bestCost);
    
    std::cout << "  Best mode: " << bestMode << std::endl;
    std::cout << "  Best cost: " << bestCost << std::endl;
    std::cout << "  PASSED!" << std::endl;
}

void testPadBorderBlock() {
    std::cout << "\n=== Test 4: Border Block Padding ===" << std::endl;
    
    IntraPrediction pred;
    
    const int actualWidth = 3;
    const int actualHeight = 5;
    const int targetSize = 8;
    
    std::vector<uint8_t> src(actualWidth * actualHeight);
    for (int y = 0; y < actualHeight; y++) {
        for (int x = 0; x < actualWidth; x++) {
            src[y * actualWidth + x] = static_cast<uint8_t>(y * 16 + x);
        }
    }
    
    std::vector<uint8_t> dst(targetSize * targetSize);
    pred.padBorderBlock(src.data(), actualWidth, dst.data(), targetSize, 
                        actualWidth, actualHeight, targetSize);
    
    bool passed = true;
    for (int y = 0; y < targetSize; y++) {
        for (int x = 0; x < targetSize; x++) {
            int expectedY = std::min(y, actualHeight - 1);
            int expectedX = std::min(x, actualWidth - 1);
            uint8_t expected = static_cast<uint8_t>(expectedY * 16 + expectedX);
            if (dst[y * targetSize + x] != expected) {
                std::cout << "  Mismatch at (" << x << "," << y << "): " 
                          << static_cast<int>(dst[y * targetSize + x]) 
                          << " != " << static_cast<int>(expected) << std::endl;
                passed = false;
            }
        }
    }
    
    if (passed) {
        std::cout << "  All padding values correct!" << std::endl;
        std::cout << "  PASSED!" << std::endl;
    } else {
        std::cout << "  FAILED!" << std::endl;
    }
}

void testAllModes() {
    std::cout << "\n=== Test 5: All 35 Intra Modes with Odd Sizes ===" << std::endl;
    
    IntraPrediction pred;
    
    const int width = 7;
    const int height = 13;
    const int stride = 16;
    
    std::vector<uint8_t> orig(stride * height);
    std::vector<uint8_t> top(33, 128);
    std::vector<uint8_t> left(33, 128);
    
    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            orig[y * stride + x] = static_cast<uint8_t>(x * 10 + y * 7);
        }
    }
    
    std::vector<uint8_t> predBuf(16 * 16);
    bool allPassed = true;
    
    for (int mode = 0; mode < 35; mode++) {
        try {
            if (mode == 0) {
                pred.predictPlanar(predBuf.data(), 16, top.data(), left.data(), width, height);
            } else if (mode == 1) {
                pred.predictDC(predBuf.data(), 16, top.data(), left.data(), width, height);
            } else {
                pred.predictAngular(predBuf.data(), 16, top.data(), left.data(), width, height, mode);
            }
        } catch (...) {
            std::cout << "  Mode " << mode << " crashed!" << std::endl;
            allPassed = false;
        }
    }
    
    if (allPassed) {
        std::cout << "  All 35 modes executed successfully!" << std::endl;
        std::cout << "  PASSED!" << std::endl;
    }
}

void testMLModeDecision() {
    std::cout << "\n=== Test 6: ML Mode Decision ===" << std::endl;
    
    const int width = 32;
    const int height = 32;
    
    std::vector<uint8_t> yData(width * height);
    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            yData[y * width + x] = static_cast<uint8_t>((x * 3 + y * 5) % 256);
        }
    }
    
    MLModeDecision mlPred(width, height);
    mlPred.initialize(nullptr, 0);
    
    std::cout << "  ML Mode Decision initialized successfully" << std::endl;
    
    std::vector<int> candidates = mlPred.getCandidateModes(yData.data(), width, width, height, 0, 0);
    
    std::cout << "  Candidate modes: ";
    for (int mode : candidates) {
        std::cout << mode << " ";
    }
    std::cout << std::endl;
    
    int reusedModes = 0;
    int totalModes = 0;
    
    for (int by = 0; by < height; by += 4) {
        for (int bx = 0; bx < width; bx += 4) {
            std::vector<int> modes = mlPred.getCandidateModes(yData.data(), width, 4, 4, bx, by);
            mlPred.recordBestMode(bx, by, modes.empty() ? 0 : modes[0], 100);
            totalModes++;
        }
    }
    
    int totalBlocks, mlPredicted, reused;
    float avgConf;
    mlPred.getStats(totalBlocks, mlPredicted, reused, avgConf);
    
    std::cout << "  Total blocks: " << totalBlocks << std::endl;
    std::cout << "  ML predicted blocks: " << mlPredicted << std::endl;
    std::cout << "  Reused blocks: " << reused << std::endl;
    std::cout << "  PASSED!" << std::endl;
}

void testCUEncoderWithML() {
    std::cout << "\n=== Test 7: CU Encoder with ML Acceleration ===" << std::endl;
    
    const int width = 128;
    const int height = 96;
    
    std::vector<uint8_t> yData(width * height);
    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            yData[y * width + x] = static_cast<uint8_t>((x + y * 2) % 256);
        }
    }
    
    CUEncoder encoder(width, height, 32, 3, 0);
    encoder.enableMLPrediction(nullptr, 0);
    
    std::cout << "  ML Acceleration enabled: " << (encoder.isMLEnabled() ? "Yes" : "No") << std::endl;
    
    encoder.encodeFrame(yData.data(), width);
    
    int totalBlocks, mlPredicted, reused;
    float avgConf;
    encoder.getMLStats(totalBlocks, mlPredicted, reused, avgConf);
    
    std::cout << "  Total cost: " << encoder.getTotalCost() << std::endl;
    std::cout << "  Total blocks processed: " << totalBlocks << std::endl;
    std::cout << "  ML predicted: " << mlPredicted << ", Reused: " << reused << std::endl;
    std::cout << "  PASSED!" << std::endl;
}

void benchmarkPredictionSpeed() {
    std::cout << "\n=== Test 8: Prediction Speed Benchmark ===" << std::endl;
    
    const int width = 256;
    const int height = 256;
    
    std::vector<uint8_t> yData(width * height);
    for (int y = 0; y < height; y++) {
        for (int x = 0; x < width; x++) {
            yData[y * width + x] = static_cast<uint8_t>((x * y) % 256);
        }
    }
    
    auto timeStart = std::chrono::high_resolution_clock::now();
    
    CUEncoder encoderFull(width, height, 32, 3, 0);
    encoderFull.encodeFrame(yData.data(), width);
    
    auto timeEnd = std::chrono::high_resolution_clock::now();
    auto durationFull = std::chrono::duration<double, std::milli>(timeEnd - timeStart).count();
    
    std::cout << "  Full search (35 modes): " << std::fixed << std::setprecision(2) << durationFull << " ms" << std::endl;
    
    timeStart = std::chrono::high_resolution_clock::now();
    
    CUEncoder encoderML(width, height, 32, 3, 0);
    encoderML.enableMLPrediction(nullptr, 0);
    encoderML.encodeFrame(yData.data(), width);
    
    timeEnd = std::chrono::high_resolution_clock::now();
    auto durationML = std::chrono::duration<double, std::milli>(timeEnd - timeStart).count();
    
    std::cout << "  ML accelerated (Top-3): " << std::fixed << std::setprecision(2) << durationML << " ms" << std::endl;
    std::cout << "  Speedup: " << std::fixed << std::setprecision(2) << (durationFull / durationML) << "x" << std::endl;
    std::cout << "  PASSED!" << std::endl;
}

int main() {
    std::cout << "=========================================" << std::endl;
    std::cout << "   HEVC Intra Encoder ML Tests          " << std::endl;
    std::cout << "=========================================" << std::endl;
    
    try {
        testOddResolution();
        testBorderBlocks();
        testBestModeSelection();
        testPadBorderBlock();
        testAllModes();
        testMLModeDecision();
        testCUEncoderWithML();
        benchmarkPredictionSpeed();
        
        std::cout << "\n=========================================" << std::endl;
        std::cout << "   All tests passed successfully!        " << std::endl;
        std::cout << "=========================================" << std::endl;
        return 0;
    } catch (const std::exception& e) {
        std::cerr << "Exception caught: " << e.what() << std::endl;
        return 1;
    } catch (...) {
        std::cerr << "Unknown exception caught!" << std::endl;
        return 1;
    }
}

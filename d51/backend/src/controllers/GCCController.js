class GCCController {
  constructor() {
    this.bitrateEstimators = new Map();
    this.validStatsHistory = new Map();
    this.predictionHistory = new Map();
    this.MAX_HISTORY_SIZE = 3;
    this.WEIGHTS = [0.5, 0.3, 0.2];
    this.ML_PREDICTION_WEIGHT = 0.3;
    this.REALTIME_MEASUREMENT_WEIGHT = 0.7;
    this.smoothingFactor = 0.85;
  }

  isValidNumber(value) {
    return typeof value === 'number' && !isNaN(value) && isFinite(value);
  }

  calculateWeightedAverage(history) {
    if (history.length === 0) return 0;
    
    let sum = 0;
    let weightSum = 0;
    const availableWeights = this.WEIGHTS.slice(0, history.length);
    
    for (let i = 0; i < history.length; i++) {
      sum += history[i] * availableWeights[i];
      weightSum += availableWeights[i];
    }
    
    return weightSum > 0 ? sum / weightSum : 0;
  }

  getValidValue(userId, field, currentValue, fieldName) {
    if (!this.validStatsHistory.has(userId)) {
      this.validStatsHistory.set(userId, {
        packetLoss: [],
        rtt: [],
        currentBitrate: []
      });
    }

    const userHistory = this.validStatsHistory.get(userId);
    const history = userHistory[field];

    if (this.isValidNumber(currentValue)) {
      history.unshift(currentValue);
      if (history.length > this.MAX_HISTORY_SIZE) {
        history.pop();
      }
      return currentValue;
    } else {
      const fallbackValue = this.calculateWeightedAverage(history);
      console.warn(`[GCC Controller] 用户 ${userId} 的 ${fieldName} 值异常: ${currentValue}, 使用历史加权平均值作为降级方案: ${fallbackValue}`);
      return fallbackValue;
    }
  }

  calculateBitrateRecommendation(stats) {
    const { userId, packetLoss, rtt, availableBandwidth, currentBitrate, timestamp, mlPrediction } = stats;
    
    if (!this.bitrateEstimators.has(userId)) {
      this.bitrateEstimators.set(userId, {
        lastBitrate: 1000000,
        lastUpdate: timestamp,
        trend: []
      });
    }

    if (!this.predictionHistory.has(userId)) {
      this.predictionHistory.set(userId, []);
    }

    const validPacketLoss = this.getValidValue(userId, 'packetLoss', packetLoss, '丢包率');
    const validRtt = this.getValidValue(userId, 'rtt', rtt, 'RTT');
    const validCurrentBitrate = this.getValidValue(userId, 'currentBitrate', currentBitrate, '当前码率');
    const validAvailableBandwidth = this.isValidNumber(availableBandwidth) ? availableBandwidth : undefined;

    const estimator = this.bitrateEstimators.get(userId);
    const realtimeBitrate = this.estimateBitrate(validPacketLoss, validRtt, validAvailableBandwidth, validCurrentBitrate, estimator);
    
    let fusedBitrate = realtimeBitrate;
    let mlAdjustment = 0;

    if (mlPrediction && mlPrediction.predictedBandwidth) {
      mlAdjustment = this.calculateMLAdjustment(mlPrediction, validCurrentBitrate);
      fusedBitrate = this.fusePredictions(realtimeBitrate, mlPrediction.predictedBandwidth + mlAdjustment);
      
      const predictionHistory = this.predictionHistory.get(userId);
      predictionHistory.push({
        timestamp,
        ...mlPrediction,
        realtimeBitrate,
        fusedBitrate
      });
      
      if (predictionHistory.length > 100) {
        predictionHistory.shift();
      }
    }

    fusedBitrate = this.applySmoothing(userId, fusedBitrate);
    const finalBitrate = this.applyConstraints(fusedBitrate, validCurrentBitrate);

    const qualityLevel = this.determineQualityLevel(finalBitrate);
    const encoderParams = this.calculateEncoderParams(finalBitrate, qualityLevel);

    estimator.lastBitrate = finalBitrate;
    estimator.lastUpdate = timestamp;
    estimator.trend.push({ timestamp, bitrate: finalBitrate });
    if (estimator.trend.length > 50) {
      estimator.trend.shift();
    }

    return {
      recommendedBitrate: finalBitrate,
      qualityLevel,
      encoderParams,
      reason: this.getAdjustmentReason(validPacketLoss, validRtt, validAvailableBandwidth, mlPrediction),
      mlContribution: {
        trend: mlPrediction?.trend || 'stable',
        confidence: mlPrediction?.confidence || 0,
        weight: this.ML_PREDICTION_WEIGHT,
        adjustment: mlAdjustment
      },
      realtimeBitrate,
      fusedBitrate
    };
  }

  calculateMLAdjustment(mlPrediction, currentBitrate) {
    const { trend, confidence } = mlPrediction;
    const baseAdjustment = currentBitrate * 0.15 * confidence;

    switch (trend) {
      case 'rising':
        return baseAdjustment;
      case 'falling':
        return -baseAdjustment;
      default:
        return 0;
    }
  }

  fusePredictions(realtimeBitrate, mlPredictedBandwidth) {
    return Math.round(
      realtimeBitrate * this.REALTIME_MEASUREMENT_WEIGHT +
      mlPredictedBandwidth * this.ML_PREDICTION_WEIGHT
    );
  }

  applySmoothing(userId, newBitrate) {
    const estimator = this.bitrateEstimators.get(userId);
    if (!estimator || !estimator.lastBitrate) {
      return newBitrate;
    }
    
    return Math.round(
      estimator.lastBitrate * this.smoothingFactor +
      newBitrate * (1 - this.smoothingFactor)
    );
  }

  applyConstraints(targetBitrate, currentBitrate) {
    const minBitrate = 100000;
    const maxBitrate = 5000000;
    const maxIncrease = currentBitrate * 1.15;
    const maxDecrease = currentBitrate * 0.7;

    return Math.round(
      Math.max(
        minBitrate,
        Math.min(
          maxBitrate,
          Math.min(targetBitrate, maxIncrease),
          Math.max(targetBitrate, maxDecrease)
        )
      )
    );
  }

  estimateBitrate(packetLoss, rtt, availableBandwidth, currentBitrate, estimator) {
    const lossFactor = this.calculateLossFactor(packetLoss);
    const rttFactor = this.calculateRTTFactor(rtt);
    const bandwidthFactor = availableBandwidth ? (availableBandwidth / currentBitrate) : 1;

    let targetBitrate = currentBitrate * lossFactor * rttFactor;
    const minBitrate = 100000;
    const maxBitrate = 5000000;

    if (packetLoss < 0.02 && rtt < 100) {
      targetBitrate = Math.min(targetBitrate * 1.05, maxBitrate);
    } else if (packetLoss > 0.05 || rtt > 200) {
      targetBitrate = Math.max(targetBitrate * 0.8, minBitrate);
    }

    if (availableBandwidth && availableBandwidth > 0) {
      targetBitrate = Math.min(targetBitrate, availableBandwidth * 0.9);
    }

    return Math.round(Math.max(minBitrate, Math.min(maxBitrate, targetBitrate)));
  }

  calculateLossFactor(packetLoss) {
    if (packetLoss < 0.01) return 1.0;
    if (packetLoss < 0.03) return 0.95;
    if (packetLoss < 0.05) return 0.85;
    if (packetLoss < 0.1) return 0.7;
    return 0.5;
  }

  calculateRTTFactor(rtt) {
    if (rtt < 50) return 1.0;
    if (rtt < 100) return 0.98;
    if (rtt < 150) return 0.95;
    if (rtt < 200) return 0.9;
    if (rtt < 300) return 0.8;
    return 0.7;
  }

  determineQualityLevel(bitrate) {
    if (bitrate >= 2000000) return 'high';
    if (bitrate >= 800000) return 'medium';
    return 'low';
  }

  calculateEncoderParams(bitrate, qualityLevel) {
    const params = {
      high: { width: 1280, height: 720, frameRate: 30 },
      medium: { width: 640, height: 480, frameRate: 24 },
      low: { width: 320, height: 240, frameRate: 15 }
    };

    const baseParams = params[qualityLevel];
    return {
      ...baseParams,
      maxBitrate: bitrate,
      minBitrate: Math.round(bitrate * 0.5),
      startBitrate: Math.round(bitrate * 0.8)
    };
  }

  getAdjustmentReason(packetLoss, rtt, availableBandwidth, mlPrediction) {
    const reasons = [];
    if (packetLoss > 0.05) reasons.push('高丢包率');
    if (rtt > 200) reasons.push('高延迟');
    if (availableBandwidth && availableBandwidth < 1000000) reasons.push('带宽受限');
    
    if (mlPrediction && mlPrediction.trend !== 'stable') {
      const trendText = mlPrediction.trend === 'rising' ? '带宽上升趋势' : '带宽下降趋势';
      const confidencePercent = Math.round(mlPrediction.confidence * 100);
      reasons.push(`${trendText} (置信度${confidencePercent}%)`);
    }
    
    return reasons.length > 0 ? reasons.join(', ') : '网络状况良好';
  }

  getPredictionHistory(userId) {
    return this.predictionHistory.get(userId) || [];
  }

  setMLWeight(newWeight) {
    this.ML_PREDICTION_WEIGHT = Math.max(0, Math.min(1, newWeight));
    this.REALTIME_MEASUREMENT_WEIGHT = 1 - this.ML_PREDICTION_WEIGHT;
  }

  getMLWeight() {
    return this.ML_PREDICTION_WEIGHT;
  }
}

module.exports = GCCController;

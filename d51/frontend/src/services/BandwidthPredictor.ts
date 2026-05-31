import * as tf from '@tensorflow/tfjs';

export type BandwidthTrend = 'rising' | 'stable' | 'falling';

export interface PredictionResult {
  trend: BandwidthTrend;
  confidence: number;
  predictedBandwidth: number;
  rawProbabilities: number[];
}

export interface StatsSequence {
  packetLoss: number[];
  rtt: number[];
  bitrate: number[];
}

interface ModelConfig {
  version: string;
  modelPath: string;
  weight: number;
  description: string;
}

class BandwidthPredictor {
  private model: tf.LayersModel | null = null;
  private modelLoaded: boolean = false;
  private modelLoading: boolean = false;
  private currentModelVersion: string = 'v1.0';
  private sequenceBuffer: StatsSequence = {
    packetLoss: [],
    rtt: [],
    bitrate: []
  };
  private readonly SEQUENCE_LENGTH: number = 30;
  private readonly FEATURE_COUNT: number = 3;
  private predictionHistory: PredictionResult[] = [];
  private modelConfig: ModelConfig | null = null;

  private readonly NORMALIZATION_PARAMS = {
    packetLoss: { mean: 0.02, std: 0.05 },
    rtt: { mean: 100, std: 150 },
    bitrate: { mean: 1500000, std: 2000000 }
  };

  constructor() {
    this.loadModelConfig();
  }

  private async loadModelConfig(): Promise<void> {
    try {
      const response = await fetch('http://localhost:3001/api/model/config');
      if (response.ok) {
        this.modelConfig = await response.json();
        if (this.modelConfig) {
          this.currentModelVersion = this.modelConfig.version;
        }
      }
    } catch (error) {
      console.warn('[BandwidthPredictor] 无法获取模型配置，使用默认版本');
      this.modelConfig = {
          version: 'v1.0',
          modelPath: '/models/lstm_bandwidth_v1/model.json',
          weight: 0.3,
          description: '默认 LSTM 带宽预测模型'
        };
    }
  }

  async loadModel(modelPath?: string): Promise<boolean> {
    if (this.modelLoading) {
      console.log('[BandwidthPredictor] 模型正在加载中...');
      return false;
    }

    this.modelLoading = true;
    const path = modelPath || (this.modelConfig?.modelPath || '/models/lstm_bandwidth_v1/model.json');

    try {
      console.log(`[BandwidthPredictor] 正在加载模型: ${path}`);
      
      this.model = await tf.loadLayersModel(path);
      this.modelLoaded = true;
      this.currentModelVersion = this.modelConfig?.version || 'v1.0';
      
      console.log(`[BandwidthPredictor] 模型加载成功，版本: ${this.currentModelVersion}`);
      
      this.model.summary();
      
      return true;
    } catch (error) {
      console.error('[BandwidthPredictor] 模型加载失败:', error);
      console.log('[BandwidthPredictor] 使用模拟预测器作为降级方案');
      this.modelLoaded = false;
      return false;
    } finally {
      this.modelLoading = false;
    }
  }

  addToSequence(packetLoss: number, rtt: number, bitrate: number): void {
    const validPacketLoss = isNaN(packetLoss) ? 0 : Math.min(Math.max(packetLoss, 0), 1);
    const validRtt = isNaN(rtt) ? 100 : Math.min(Math.max(rtt, 0), 5000);
    const validBitrate = isNaN(bitrate) ? 1000000 : Math.min(Math.max(bitrate, 100000), 10000000);

    this.sequenceBuffer.packetLoss.push(validPacketLoss);
    this.sequenceBuffer.rtt.push(validRtt);
    this.sequenceBuffer.bitrate.push(validBitrate);

    if (this.sequenceBuffer.packetLoss.length > this.SEQUENCE_LENGTH) {
      this.sequenceBuffer.packetLoss.shift();
      this.sequenceBuffer.rtt.shift();
      this.sequenceBuffer.bitrate.shift();
    }
  }

  hasEnoughData(): boolean {
    return this.sequenceBuffer.packetLoss.length >= this.SEQUENCE_LENGTH;
  }

  private normalizeData(): number[][] {
    const normalized: number[][] = [];
    
    for (let i = 0; i < this.SEQUENCE_LENGTH; i++) {
      const packetLoss = (this.sequenceBuffer.packetLoss[i] - this.NORMALIZATION_PARAMS.packetLoss.mean) / this.NORMALIZATION_PARAMS.packetLoss.std;
      const rtt = (this.sequenceBuffer.rtt[i] - this.NORMALIZATION_PARAMS.rtt.mean) / this.NORMALIZATION_PARAMS.rtt.std;
      const bitrate = (this.sequenceBuffer.bitrate[i] - this.NORMALIZATION_PARAMS.bitrate.mean) / this.NORMALIZATION_PARAMS.bitrate.std;
      
      normalized.push([packetLoss, rtt, bitrate]);
    }
    
    return normalized;
  }

  async predict(): Promise<PredictionResult> {
    if (!this.hasEnoughData()) {
      return {
        trend: 'stable',
        confidence: 0.5,
        predictedBandwidth: this.getCurrentAverageBitrate(),
        rawProbabilities: [0.25, 0.5, 0.25]
      };
    }

    if (this.modelLoaded && this.model) {
      return this.predictWithModel();
    } else {
      return this.predictWithHeuristic();
    }
  }

  private async predictWithModel(): Promise<PredictionResult> {
    let probabilities: number[] = [];
    
    tf.tidy(() => {
      const normalizedData = this.normalizeData();
      const inputTensor = tf.tensor3d([normalizedData], [1, this.SEQUENCE_LENGTH, this.FEATURE_COUNT]);
      
      const prediction = this.model!.predict(inputTensor) as tf.Tensor;
      probabilities = Array.from(prediction.dataSync()) as number[];
    });
    
    const maxIndex = probabilities.indexOf(Math.max(...probabilities));
    const trends: BandwidthTrend[] = ['falling', 'stable', 'rising'];
    const trend = trends[maxIndex];
    const confidence = probabilities[maxIndex] as number;
    
    const predictedBandwidth = this.calculatePredictedBandwidth(trend, confidence);
    
    const result: PredictionResult = {
      trend,
      confidence,
      predictedBandwidth,
      rawProbabilities: probabilities
    };

    this.predictionHistory.push(result);
    if (this.predictionHistory.length > 50) {
      this.predictionHistory.shift();
    }

    return result;
  }

  private predictWithHeuristic(): PredictionResult {
    const recentBitrates = this.sequenceBuffer.bitrate.slice(-10);
    const recentPacketLoss = this.sequenceBuffer.packetLoss.slice(-10);
    const recentRtt = this.sequenceBuffer.rtt.slice(-10);

    const bitrateSlope = this.calculateSlope(recentBitrates);
    const avgPacketLoss = recentPacketLoss.reduce((a, b) => a + b, 0) / recentPacketLoss.length;
    const avgRtt = recentRtt.reduce((a, b) => a + b, 0) / recentRtt.length;

    let trend: BandwidthTrend = 'stable';
    let confidence = 0.6;

    if (bitrateSlope > 50000 && avgPacketLoss < 0.02 && avgRtt < 150) {
      trend = 'rising';
      confidence = 0.7;
    } else if (bitrateSlope < -50000 || avgPacketLoss > 0.05 || avgRtt > 300) {
      trend = 'falling';
      confidence = 0.75;
    }

    return {
      trend,
      confidence,
      predictedBandwidth: this.calculatePredictedBandwidth(trend, confidence),
      rawProbabilities: [
        trend === 'falling' ? confidence : (1 - confidence) / 2,
        trend === 'stable' ? confidence : (1 - confidence) / 2,
        trend === 'rising' ? confidence : (1 - confidence) / 2
      ]
    };
  }

  private calculateSlope(values: number[]): number {
    if (values.length < 2) return 0;
    
    const n = values.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += values[i];
      sumXY += i * values[i];
      sumXX += i * i;
    }
    
    return (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  }

  private calculatePredictedBandwidth(trend: BandwidthTrend, confidence: number): number {
    const currentAvg = this.getCurrentAverageBitrate();
    
    switch (trend) {
      case 'rising':
        return currentAvg * (1 + 0.2 * confidence);
      case 'falling':
        return currentAvg * (1 - 0.2 * confidence);
      default:
        return currentAvg;
    }
  }

  private getCurrentAverageBitrate(): number {
    if (this.sequenceBuffer.bitrate.length === 0) return 1000000;
    const recent = this.sequenceBuffer.bitrate.slice(-5);
    return recent.reduce((a, b) => a + b, 0) / recent.length;
  }

  getPredictionWeight(): number {
    return this.modelConfig?.weight || 0.3;
  }

  getModelVersion(): string {
    return this.currentModelVersion;
  }

  isModelLoaded(): boolean {
    return this.modelLoaded;
  }

  getPredictionHistory(): PredictionResult[] {
    return [...this.predictionHistory];
  }

  resetSequence(): void {
    this.sequenceBuffer = {
      packetLoss: [],
      rtt: [],
      bitrate: []
    };
  }

  dispose(): void {
    if (this.model) {
      this.model.dispose();
      this.model = null;
      this.modelLoaded = false;
    }
  }
}

export default new BandwidthPredictor();

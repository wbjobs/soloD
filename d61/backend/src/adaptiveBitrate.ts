import { NetworkStats, BitrateStrategy, GCCEstimation } from './types';

const QUALITY_LEVELS = {
  high: {
    bitrate: 2500000,
    resolution: { width: 1280, height: 720 },
    frameRate: 30,
  },
  medium: {
    bitrate: 1000000,
    resolution: { width: 640, height: 480 },
    frameRate: 24,
  },
  low: {
    bitrate: 300000,
    resolution: { width: 320, height: 240 },
    frameRate: 15,
  },
};

const PACKET_LOSS_THRESHOLD = {
  low: 0.02,
  medium: 0.05,
  high: 0.1,
};

const RTT_THRESHOLD = {
  low: 100,
  medium: 200,
  high: 300,
};

export class GCCCongestionController {
  private currentBitrate: number;
  private lastUpdate: number;
  private history: NetworkStats[];

  constructor(initialBitrate: number = 1000000) {
    this.currentBitrate = initialBitrate;
    this.lastUpdate = Date.now();
    this.history = [];
  }

  estimate(stats: NetworkStats): GCCEstimation {
    this.history.push(stats);
    if (this.history.length > 20) {
      this.history.shift();
    }

    const lossTrend = this.calculateLossTrend();
    const rttTrend = this.calculateRttTrend();
    const bandwidthTrend = this.calculateBandwidthTrend();

    let state: 'increase' | 'decrease' | 'stable' = 'stable';
    let confidence = 0.5;

    if (stats.packetLossRate > PACKET_LOSS_THRESHOLD.high || stats.rtt > RTT_THRESHOLD.high) {
      state = 'decrease';
      confidence = 0.9;
    } else if (stats.packetLossRate > PACKET_LOSS_THRESHOLD.medium || stats.rtt > RTT_THRESHOLD.medium) {
      state = 'decrease';
      confidence = 0.7;
    } else if (lossTrend > 0 || rttTrend > 0) {
      state = 'decrease';
      confidence = 0.6;
    } else if (
      stats.packetLossRate < PACKET_LOSS_THRESHOLD.low &&
      stats.rtt < RTT_THRESHOLD.low &&
      bandwidthTrend >= 0
    ) {
      state = 'increase';
      confidence = 0.8;
    }

    this.adjustBitrate(state, stats);

    return {
      state,
      targetBitrate: this.currentBitrate,
      confidence,
    };
  }

  private calculateLossTrend(): number {
    if (this.history.length < 5) return 0;
    const recent = this.history.slice(-5);
    const older = this.history.slice(-10, -5);
    
    const recentAvg = recent.reduce((sum, s) => sum + s.packetLossRate, 0) / recent.length;
    const olderAvg = older.length > 0 
      ? older.reduce((sum, s) => sum + s.packetLossRate, 0) / older.length 
      : recentAvg;
    
    return recentAvg - olderAvg;
  }

  private calculateRttTrend(): number {
    if (this.history.length < 5) return 0;
    const recent = this.history.slice(-5);
    const older = this.history.slice(-10, -5);
    
    const recentAvg = recent.reduce((sum, s) => sum + s.rtt, 0) / recent.length;
    const olderAvg = older.length > 0 
      ? older.reduce((sum, s) => sum + s.rtt, 0) / older.length 
      : recentAvg;
    
    return recentAvg - olderAvg;
  }

  private calculateBandwidthTrend(): number {
    if (this.history.length < 3) return 0;
    const recent = this.history.slice(-3);
    const older = this.history.slice(-6, -3);
    
    const recentAvg = recent.reduce((sum, s) => sum + s.availableBandwidth, 0) / recent.length;
    const olderAvg = older.length > 0 
      ? older.reduce((sum, s) => sum + s.availableBandwidth, 0) / older.length 
      : recentAvg;
    
    return recentAvg - olderAvg;
  }

  private adjustBitrate(state: 'increase' | 'decrease' | 'stable', stats: NetworkStats): void {
    const now = Date.now();
    const timeSinceLastUpdate = now - this.lastUpdate;

    if (timeSinceLastUpdate < 500) return;

    switch (state) {
      case 'increase':
        const maxIncrease = Math.min(stats.availableBandwidth * 0.8, this.currentBitrate * 1.08);
        this.currentBitrate = Math.min(maxIncrease, QUALITY_LEVELS.high.bitrate);
        break;
      case 'decrease':
        const decreaseFactor = 1 - (stats.packetLossRate * 2 + stats.rtt / 1000);
        this.currentBitrate = Math.max(
          this.currentBitrate * Math.max(decreaseFactor, 0.5),
          QUALITY_LEVELS.low.bitrate
        );
        break;
      case 'stable':
        this.currentBitrate = Math.min(
          this.currentBitrate * 1.02,
          stats.availableBandwidth * 0.9,
          QUALITY_LEVELS.high.bitrate
        );
        break;
    }

    this.lastUpdate = now;
  }

  getCurrentBitrate(): number {
    return this.currentBitrate;
  }
}

export function selectQualityLevel(targetBitrate: number): 'high' | 'medium' | 'low' {
  if (targetBitrate >= QUALITY_LEVELS.high.bitrate * 0.8) {
    return 'high';
  } else if (targetBitrate >= QUALITY_LEVELS.medium.bitrate * 0.8) {
    return 'medium';
  } else {
    return 'low';
  }
}

export function calculateBitrateStrategy(
  stats: NetworkStats,
  gccEstimation: GCCEstimation
): BitrateStrategy {
  const targetBitrate = gccEstimation.targetBitrate;
  const qualityLevel = selectQualityLevel(targetBitrate);
  const level = QUALITY_LEVELS[qualityLevel];

  const adjustedBitrate = Math.min(
    Math.max(targetBitrate, level.bitrate * 0.7),
    level.bitrate * 1.3
  );

  return {
    targetBitrate: Math.round(adjustedBitrate),
    maxBitrate: Math.round(level.bitrate * 1.5),
    minBitrate: Math.round(level.bitrate * 0.5),
    resolution: level.resolution,
    frameRate: level.frameRate,
    qualityLevel,
  };
}

export function getSimulcastLayers(): { rid: string; scaleResolutionDownBy: number; maxBitrate: number; maxFramerate: number }[] {
  return [
    { rid: 'high', scaleResolutionDownBy: 1, maxBitrate: 2500000, maxFramerate: 30 },
    { rid: 'medium', scaleResolutionDownBy: 2, maxBitrate: 1000000, maxFramerate: 24 },
    { rid: 'low', scaleResolutionDownBy: 4, maxBitrate: 300000, maxFramerate: 15 },
  ];
}

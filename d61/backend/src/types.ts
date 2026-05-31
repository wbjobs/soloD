export interface NetworkStats {
  packetLossRate: number;
  rtt: number;
  availableBandwidth: number;
  timestamp: number;
}

export interface BitrateStrategy {
  targetBitrate: number;
  maxBitrate: number;
  minBitrate: number;
  resolution: { width: number; height: number };
  frameRate: number;
  qualityLevel: 'high' | 'medium' | 'low';
}

export interface SimulcastLayer {
  rid: string;
  active: boolean;
  bitrate: number;
  scaleResolutionDownBy: number;
  maxFramerate: number;
}

export interface Participant {
  id: string;
  socketId: string;
  roomId: string;
  name: string;
  networkStatsHistory: NetworkStats[];
  currentStrategy: BitrateStrategy;
}

export interface Room {
  id: string;
  participants: Map<string, Participant>;
  bandwidthHistory: BandwidthRecord[];
  createdAt: number;
}

export interface BandwidthRecord {
  timestamp: number;
  participantId: string;
  availableBandwidth: number;
  packetLossRate: number;
  rtt: number;
  recommendedBitrate: number;
  qualityLevel: string;
}

export interface GCCEstimation {
  state: 'increase' | 'decrease' | 'stable';
  targetBitrate: number;
  confidence: number;
}

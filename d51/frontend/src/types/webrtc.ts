export interface QualityLevel {
  id: 'high' | 'medium' | 'low';
  bitrate: number;
  width: number;
  height: number;
  frameRate: number;
}

export interface EncoderParams {
  width: number;
  height: number;
  frameRate: number;
  maxBitrate: number;
  minBitrate: number;
  startBitrate: number;
}

export interface BitrateRecommendation {
  recommendedBitrate: number;
  qualityLevel: 'high' | 'medium' | 'low';
  encoderParams: EncoderParams;
  reason: string;
}

export interface MLPrediction {
  trend: 'rising' | 'stable' | 'falling';
  confidence: number;
  predictedBandwidth: number;
  rawProbabilities: number[];
}

export interface NetworkStats {
  timestamp: number;
  packetLoss: number;
  rtt: number;
  availableBandwidth?: number;
  currentBitrate: number;
  bytesSent?: number;
  bytesReceived?: number;
  framesSent?: number;
  framesReceived?: number;
  framesDropped?: number;
  mlPrediction?: MLPrediction;
}

export interface PeerConnectionConfig {
  userId: string;
  roomId: string;
  iceServers?: RTCIceServer[];
}

export interface SimulcastEncoding {
  rid: 'high' | 'medium' | 'low';
  active: boolean;
  maxBitrate: number;
  scaleResolutionDownBy: number;
  maxFramerate?: number;
}

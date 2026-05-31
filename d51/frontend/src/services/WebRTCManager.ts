import SignalingService from './SignalingService';
import BandwidthPredictor from './BandwidthPredictor';
import { NetworkStats, BitrateRecommendation, EncoderParams, SimulcastEncoding } from '../types/webrtc';

interface ValidStatsHistory {
    packetLoss: number[];
    rtt: number[];
    bytesSent: number[];
    bytesReceived: number[];
  }

  class WebRTCManager {
    private peerConnections: Map<string, RTCPeerConnection> = new Map();
    private localStream: MediaStream | null = null;
    private statsReportInterval: number | null = null;
    private currentBitrate: number = 1000000;
    private currentQualityLevel: 'high' | 'medium' | 'low' = 'medium';
    private onRemoteStreamCallback: ((userId: string, stream: MediaStream) => void) | null = null;
    private onStatsUpdateCallback: ((stats: NetworkStats) => void) | null = null;
    private onBitrateRecommendationCallback: ((recommendation: BitrateRecommendation) => void) | null = null;

    private validStatsHistory: ValidStatsHistory = {
      packetLoss: [],
      rtt: [],
      bytesSent: [],
      bytesReceived: []
    };
    private readonly MAX_HISTORY_SIZE: number = 3;
    private readonly WEIGHTS: number[] = [0.5, 0.3, 0.2];

  private simulcastEncodings: SimulcastEncoding[] = [
    { rid: 'high', active: true, maxBitrate: 2500000, scaleResolutionDownBy: 1, maxFramerate: 30 },
    { rid: 'medium', active: true, maxBitrate: 1000000, scaleResolutionDownBy: 2, maxFramerate: 24 },
    { rid: 'low', active: true, maxBitrate: 300000, scaleResolutionDownBy: 4, maxFramerate: 15 }
  ];

  async initializeLocalStream(constraints: MediaStreamConstraints = {
    video: true,
    audio: true
  }): Promise<MediaStream> {
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      return this.localStream;
    } catch (error) {
      console.error('获取本地媒体流失败:', error);
      throw error;
    }
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  async createPeerConnection(targetUserId: string): Promise<RTCPeerConnection> {
    const config: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    };

    const pc = new RTCPeerConnection(config);

    if (this.localStream) {
      const sender = pc.addTrack(this.localStream.getVideoTracks()[0], this.localStream);
      
      if (sender.setParameters) {
        const parameters = sender.getParameters();
        if (!parameters.encodings) {
          parameters.encodings = [];
        }
        parameters.encodings = this.simulcastEncodings.map(enc => ({
          ...enc,
          active: enc.active
        }));
        await sender.setParameters(parameters);
      }

      if (this.localStream.getAudioTracks().length > 0) {
        pc.addTrack(this.localStream.getAudioTracks()[0], this.localStream);
      }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        SignalingService.sendIceCandidate(targetUserId, event.candidate);
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      if (this.onRemoteStreamCallback) {
        this.onRemoteStreamCallback(targetUserId, stream);
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`连接状态 ${targetUserId}:`, pc.connectionState);
    };

    this.peerConnections.set(targetUserId, pc);
    return pc;
  }

  async createOffer(targetUserId: string): Promise<void> {
    const pc = await this.getOrCreatePeerConnection(targetUserId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    SignalingService.sendOffer(targetUserId, offer);
  }

  async handleOffer(from: string, offer: RTCSessionDescriptionInit): Promise<void> {
    const pc = await this.getOrCreatePeerConnection(from);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    SignalingService.sendAnswer(from, answer);
  }

  async handleAnswer(from: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.peerConnections.get(from);
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    }
  }

  async handleIceCandidate(from: string, candidate: RTCIceCandidate): Promise<void> {
    const pc = this.peerConnections.get(from);
    if (pc) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  private async getOrCreatePeerConnection(userId: string): Promise<RTCPeerConnection> {
    let pc = this.peerConnections.get(userId);
    if (!pc) {
      pc = await this.createPeerConnection(userId);
    }
    return pc;
  }

  private isValidNumber(value: any): boolean {
    return typeof value === 'number' && !isNaN(value) && isFinite(value);
  }

  private calculateWeightedAverage(history: number[]): number {
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

  private addToHistory(field: keyof ValidStatsHistory, value: number): void {
    const history = this.validStatsHistory[field];
    history.unshift(value);
    if (history.length > this.MAX_HISTORY_SIZE) {
      history.pop();
    }
  }

  private getValidValue(
    field: keyof ValidStatsHistory,
    currentValue: any,
    fieldName: string
  ): number {
    if (this.isValidNumber(currentValue)) {
      this.addToHistory(field, currentValue);
      return currentValue;
    } else {
      const fallbackValue = this.calculateWeightedAverage(this.validStatsHistory[field]);
      console.warn(`[WebRTC Stats] ${fieldName} 值异常: ${currentValue}, 使用历史加权平均值作为降级方案: ${fallbackValue}`);
      return fallbackValue;
    }
  }

  startStatsReporting(intervalMs: number = 500): void {
    if (this.statsReportInterval) {
      this.stopStatsReporting();
    }

    this.statsReportInterval = window.setInterval(async () => {
      const stats = await this.collectNetworkStats();
      if (stats) {
        SignalingService.sendStatsReport(stats);
        if (this.onStatsUpdateCallback) {
          this.onStatsUpdateCallback(stats);
        }
      }
    }, intervalMs);
  }

  stopStatsReporting(): void {
    if (this.statsReportInterval) {
      clearInterval(this.statsReportInterval);
      this.statsReportInterval = null;
    }
  }

  private async collectNetworkStats(): Promise<(NetworkStats & { mlPrediction?: any }) | null> {
    try {
      let totalBytesSent = 0;
      let totalBytesReceived = 0;
      let totalPacketsLost = 0;
      let totalPacketsReceived = 0;
      let rttSum = 0;
      let rttCount = 0;

      for (const [, pc] of this.peerConnections) {
        const stats = await pc.getStats();
        
        for (const report of stats.values()) {
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            totalBytesReceived += this.isValidNumber(report.bytesReceived) ? report.bytesReceived : 0;
            totalPacketsLost += this.isValidNumber(report.packetsLost) ? report.packetsLost : 0;
            totalPacketsReceived += this.isValidNumber(report.packetsReceived) ? report.packetsReceived : 0;
          }
          
          if (report.type === 'outbound-rtp' && report.kind === 'video') {
            totalBytesSent += this.isValidNumber(report.bytesSent) ? report.bytesSent : 0;
          }

          if (report.type === 'remote-inbound-rtp') {
            if (this.isValidNumber(report.roundTripTime) && report.roundTripTime > 0) {
              rttSum += report.roundTripTime * 1000;
              rttCount++;
            }
          }

          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            if (this.isValidNumber(report.currentRoundTripTime) && report.currentRoundTripTime > 0) {
              rttSum += report.currentRoundTripTime * 1000;
              rttCount++;
            }
          }
        }
      }

      let packetLoss = totalPacketsReceived > 0 
        ? totalPacketsLost / (totalPacketsReceived + totalPacketsLost) 
        : 0;

      let rtt = rttCount > 0 ? rttSum / rttCount : 0;

      packetLoss = this.getValidValue('packetLoss', packetLoss, '丢包率');
      rtt = this.getValidValue('rtt', rtt, 'RTT');
      totalBytesSent = this.getValidValue('bytesSent', totalBytesSent, '发送字节数');
      totalBytesReceived = this.getValidValue('bytesReceived', totalBytesReceived, '接收字节数');

      BandwidthPredictor.addToSequence(packetLoss, rtt, this.currentBitrate);
      const mlPrediction = await BandwidthPredictor.predict();

      const stats = {
        timestamp: Date.now(),
        packetLoss,
        rtt,
        currentBitrate: this.currentBitrate,
        bytesSent: totalBytesSent,
        bytesReceived: totalBytesReceived,
        mlPrediction
      };

      return stats;
    } catch (error) {
      console.error('收集网络统计信息失败:', error);
      return null;
    }
  }

  async adjustBitrate(recommendation: BitrateRecommendation): Promise<void> {
    this.currentBitrate = recommendation.recommendedBitrate;
    this.currentQualityLevel = recommendation.qualityLevel;

    console.log(`调整码率: ${this.formatBitrate(recommendation.recommendedBitrate)}, 质量: ${recommendation.qualityLevel}, 原因: ${recommendation.reason}`);

    for (const [, pc] of this.peerConnections) {
      const senders = pc.getSenders();
      
      for (const sender of senders) {
        if (sender.track?.kind === 'video') {
          const parameters = sender.getParameters();
          
          if (parameters.encodings && parameters.encodings.length > 0) {
            parameters.encodings = this.adjustSimulcastEncodings(
              parameters.encodings,
              recommendation.encoderParams
            );

            try {
              await sender.setParameters(parameters);
            } catch (error) {
              console.error('设置发送参数失败:', error);
            }
          }
        }
      }
    }

    if (this.onBitrateRecommendationCallback) {
      this.onBitrateRecommendationCallback(recommendation);
    }
  }

  private adjustSimulcastEncodings(
    encodings: RTCRtpEncodingParameters[],
    encoderParams: EncoderParams
  ): RTCRtpEncodingParameters[] {
    const qualityLevel = this.currentQualityLevel;
    
    return encodings.map(encoding => {
      const rid = encoding.rid as 'high' | 'medium' | 'low';
      
      if (qualityLevel === 'low') {
        encoding.active = rid === 'low';
      } else if (qualityLevel === 'medium') {
        encoding.active = rid === 'medium' || rid === 'low';
      } else {
        encoding.active = true;
      }

      if (rid === 'high') {
        encoding.maxBitrate = encoderParams.maxBitrate;
        encoding.maxFramerate = encoderParams.frameRate;
      } else if (rid === 'medium') {
        encoding.maxBitrate = Math.min(encoderParams.maxBitrate * 0.5, 1000000);
        encoding.maxFramerate = Math.min(encoderParams.frameRate, 24);
      } else {
        encoding.maxBitrate = Math.min(encoderParams.maxBitrate * 0.2, 300000);
        encoding.maxFramerate = Math.min(encoderParams.frameRate, 15);
      }

      return encoding;
    });
  }

  async switchReceiverQuality(targetQuality: 'high' | 'medium' | 'low'): Promise<void> {
    console.log(`切换接收质量到: ${targetQuality}`);
    
    for (const [, pc] of this.peerConnections) {
      const senders = pc.getSenders();
      
      for (const sender of senders) {
        if (sender.track?.kind === 'video') {
          const parameters = sender.getParameters();
          
          if (parameters.encodings && parameters.encodings.length > 0) {
            parameters.encodings = parameters.encodings.map((encoding: RTCRtpEncodingParameters) => {
              const rid = encoding.rid as 'high' | 'medium' | 'low';
              
              if (targetQuality === 'low') {
                encoding.active = rid === 'low';
              } else if (targetQuality === 'medium') {
                encoding.active = rid === 'medium' || rid === 'low';
              } else {
                encoding.active = true;
              }
              
              return encoding;
            });
          }
        }
      }
    }
  }

  setOnRemoteStreamCallback(callback: (userId: string, stream: MediaStream) => void): void {
    this.onRemoteStreamCallback = callback;
  }

  setOnStatsUpdateCallback(callback: (stats: NetworkStats) => void): void {
    this.onStatsUpdateCallback = callback;
  }

  setOnBitrateRecommendationCallback(callback: (recommendation: BitrateRecommendation) => void): void {
    this.onBitrateRecommendationCallback = callback;
  }

  getCurrentBitrate(): number {
    return this.currentBitrate;
  }

  getCurrentQualityLevel(): string {
    return this.currentQualityLevel;
  }

  private formatBitrate(bitrate: number): string {
    if (bitrate >= 1000000) {
      return `${(bitrate / 1000000).toFixed(2)} Mbps`;
    }
    return `${(bitrate / 1000).toFixed(2)} Kbps`;
  }

  async initMLModel(): Promise<boolean> {
    try {
      const success = await BandwidthPredictor.loadModel();
      console.log(`ML 模型加载${success ? '成功' : '失败'}`);
      return success;
    } catch (error) {
      console.error('ML 模型加载失败:', error);
      return false;
    }
  }

  isMLModelLoaded(): boolean {
    return BandwidthPredictor.isModelLoaded();
  }

  getCurrentMLModelVersion(): string {
    return BandwidthPredictor.getModelVersion();
  }

  getPredictionHistory(): any[] {
    return BandwidthPredictor.getPredictionHistory();
  }

  close(): void {
    this.stopStatsReporting();
    
    for (const [, pc] of this.peerConnections) {
      pc.close();
    }
    this.peerConnections.clear();

    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    BandwidthPredictor.dispose();
  }
}

export default new WebRTCManager();

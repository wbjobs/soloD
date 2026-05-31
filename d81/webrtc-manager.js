const SVC_LAYERS = {
  L0: { bitrate: 500000, resolution: { width: 320, height: 240 }, fps: 15, quality: 'low' },
  L1: { bitrate: 1000000, resolution: { width: 640, height: 480 }, fps: 30, quality: 'medium' },
  L2: { bitrate: 2500000, resolution: { width: 1280, height: 720 }, fps: 30, quality: 'high' }
};

class WebRTCManager {
  constructor(signalingClient, videoDecoder) {
    this.signalingClient = signalingClient;
    this.videoDecoder = videoDecoder;
    this.peerConnection = null;
    this.localStream = null;
    this.remoteUserId = null;
    this.isInitiator = false;
    this.iceCandidatesQueue = [];
    this.frameCount = 0;
    this.timestamp = 0;
    this.isDecoderConfigured = false;
    
    this.videoReceiver = null;
    this.videoSender = null;
    this.lastKeyFrameTime = 0;
    this.consecutiveDeltaFrames = 0;
    this.maxConsecutiveDeltaFrames = 30;
    this.isRecovering = false;
    this.recoveryTimeout = null;
    this.frameTimestamps = [];
    this.maxFrameHistory = 10;
    this.lastFrameTime = 0;
    this.frameTimeout = 3000;
    this.frameCheckInterval = null;
    
    this.decoderErrorHandler = null;
    
    this.currentSvcLayer = 'L1';
    this.targetSvcLayer = 'L1';
    this.bandwidthStats = {
      bitrate: 1000000,
      packetLoss: 0,
      jitter: 0,
      rtt: 0,
      layerChanges: 0
    };
    this.switchCooldown = 0;
    this.statsInterval = null;
    this.bytesSent = 0;
    this.bytesReceived = 0;
    this.lastStatsTime = Date.now();
    this.frameBytesHistory = [];
    
    this.onSvcLayerChange = null;
    this.onBandwidthUpdate = null;
  }

  async init(localStream) {
    this.localStream = localStream;
    
    const config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    this.peerConnection = new RTCPeerConnection(config);
    
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.remoteUserId) {
        this.signalingClient.sendCandidate(this.remoteUserId, event.candidate);
      }
    };

    this.peerConnection.onconnectionstatechange = () => {
      this.log(`连接状态: ${this.peerConnection.connectionState}`, 'info');
      
      if (this.peerConnection.connectionState === 'connected') {
        this.log('P2P 连接已建立!', 'success');
      } else if (this.peerConnection.connectionState === 'failed' || 
                 this.peerConnection.connectionState === 'disconnected') {
        this.log('连接失败或断开', 'error');
      }
    };

    this.peerConnection.ontrack = (event) => {
      this.log(`收到远程轨道: ${event.track.kind}`, 'info');
      
      if (event.track.kind === 'video') {
        this.setupRawFrameExtraction(event.receiver);
      }
    };

    for (const track of localStream.getTracks()) {
      this.peerConnection.addTrack(track, localStream);
    }

    this.setupSignalingHandlers();
  }

  setupRawFrameExtraction(receiver) {
    this.videoReceiver = receiver;
    
    const senders = this.peerConnection.getSenders();
    this.videoSender = senders.find(s => s.track && s.track.kind === 'video');
    
    if ('createEncodedVideoStreams' in RTCRtpReceiver.prototype) {
      try {
        const { readable } = receiver.createEncodedVideoStreams();
        const transformStream = new TransformStream({
          transform: (chunk, controller) => {
            this.handleEncodedChunk(chunk);
            controller.enqueue(chunk);
          }
        });
        
        readable.pipeThrough(transformStream);
        this.log('已启用编码帧提取', 'info');
        
        this.startFrameMonitoring();
        this.setupDecoderErrorHandling();
        this.startBandwidthMonitoring();
      } catch (e) {
        this.log(`编码帧提取失败: ${e.message}`, 'warning');
        this.setupFrameCallback(receiver);
      }
    } else {
      this.setupFrameCallback(receiver);
    }
  }

  startBandwidthMonitoring() {
    this.stopBandwidthMonitoring();
    
    this.statsInterval = setInterval(async () => {
      if (this.peerConnection && this.remoteUserId) {
        try {
          await this.collectAndSendStats();
        } catch (e) {
          console.warn('收集统计信息失败:', e);
        }
      }
    }, 1000);
  }

  stopBandwidthMonitoring() {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
  }

  async collectAndSendStats() {
    if (!this.peerConnection) return;
    
    const stats = await this.peerConnection.getStats();
    const now = Date.now();
    const timeDelta = (now - this.lastStatsTime) / 1000;
    
    let bytesReceived = 0;
    let bytesSent = 0;
    let jitter = 0;
    let packetsLost = 0;
    let fractionLost = 0;
    let rtt = 0;
    
    for (const report of stats.values()) {
      if (report.type === 'inbound-rtp' && report.kind === 'video') {
        bytesReceived = report.bytesReceived || 0;
        jitter = report.jitter || 0;
        packetsLost = report.packetsLost || 0;
        fractionLost = report.fractionLost || 0;
      }
      if (report.type === 'outbound-rtp' && report.kind === 'video') {
        bytesSent = report.bytesSent || 0;
      }
      if (report.type === 'remote-inbound-rtp' && report.kind === 'video') {
        rtt = report.roundTripTime || 0;
      }
      if (report.type === 'candidate-pair' && report.state === 'succeeded') {
        rtt = report.currentRoundTripTime || rtt;
      }
    }
    
    if (timeDelta > 0) {
      const bitrate = ((bytesReceived - this.bytesReceived) * 8) / timeDelta;
      this.bytesReceived = bytesReceived;
      
      this.bandwidthStats.bitrate = bitrate;
      this.bandwidthStats.jitter = jitter;
      this.bandwidthStats.rtt = rtt * 1000;
      
      this.sendPacketStats(bytesReceived);
      this.sendRTCPReport({
        jitter,
        fractionLost,
        packetsLost,
        rtt: this.bandwidthStats.rtt,
        bitrate
      });
    }
    
    this.lastStatsTime = now;
  }

  sendPacketStats(bytes) {
    this.signalingClient.send({
      type: 'packetStats',
      size: bytes,
      timestamp: Date.now(),
      targetUserId: this.remoteUserId
    });
  }

  sendRTCPReport(report) {
    this.signalingClient.send({
      type: 'rtcpReport',
      report: report,
      targetUserId: this.remoteUserId
    });
  }

  setupDecoderErrorHandling() {
    this.decoderErrorHandler = () => {
      this.log('检测到解码器错误，触发恢复机制', 'error');
      this.triggerRecovery();
    };
    
    if (this.videoDecoder) {
      this.videoDecoder.onError = this.decoderErrorHandler;
    }
  }

  startFrameMonitoring() {
    this.stopFrameMonitoring();
    
    this.frameCheckInterval = setInterval(() => {
      const now = Date.now();
      
      if (this.isDecoderConfigured && this.lastFrameTime > 0) {
        const timeSinceLastFrame = now - this.lastFrameTime;
        if (timeSinceLastFrame > this.frameTimeout) {
          this.log(`帧超时: ${timeSinceLastFrame}ms，触发恢复`, 'warning');
          this.triggerRecovery();
        }
      }
      
      if (this.consecutiveDeltaFrames > this.maxConsecutiveDeltaFrames) {
        this.log(`连续P帧过多: ${this.consecutiveDeltaFrames}，请求关键帧`, 'warning');
        this.requestKeyFrame();
      }
    }, 1000);
  }

  stopFrameMonitoring() {
    if (this.frameCheckInterval) {
      clearInterval(this.frameCheckInterval);
      this.frameCheckInterval = null;
    }
  }

  requestKeyFrame() {
    if (this.videoReceiver && this.videoReceiver.sendRtcpFeedback) {
      try {
        this.videoReceiver.sendRtcpFeedback({
          type: 'pli',
          ssrc: this.videoReceiver.getSynchronizationSources()[0]?.ssrc
        });
        this.log('发送 PLI 关键帧请求', 'info');
      } catch (e) {
        this.log(`PLI 请求失败: ${e.message}`, 'warning');
        this.requestKeyFrameViaSender();
      }
    } else {
      this.requestKeyFrameViaSender();
    }
  }

  requestKeyFrameViaSender() {
    if (this.videoSender && this.videoSender.sendRtcpFeedback) {
      try {
        this.videoSender.sendRtcpFeedback({
          type: 'fir'
        });
        this.log('发送 FIR 关键帧请求', 'info');
      } catch (e) {
        this.log(`FIR 请求失败: ${e.message}，尝试替代方法`, 'warning');
        this.forceKeyFrameByRenegotiation();
      }
    }
  }

  async forceKeyFrameByRenegotiation() {
    try {
      const offer = await this.peerConnection.createOffer({
        iceRestart: false,
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      
      await this.peerConnection.setLocalDescription(offer);
      
      if (this.remoteUserId) {
        this.signalingClient.sendOffer(this.remoteUserId, offer);
        this.log('通过重新协商请求关键帧', 'info');
      }
    } catch (e) {
      this.log(`重新协商失败: ${e.message}`, 'error');
    }
  }

  async triggerRecovery() {
    if (this.isRecovering) {
      this.log('恢复流程已在进行中，跳过', 'warning');
      return;
    }
    
    this.isRecovering = true;
    this.log('开始解码器恢复流程', 'warning');
    
    if (this.videoDecoder) {
      try {
        this.videoDecoder.flush().catch(() => {});
        this.videoDecoder.reset();
        this.log('解码器已重置', 'info');
      } catch (e) {
        this.log(`解码器重置失败: ${e.message}`, 'error');
      }
    }
    
    this.isDecoderConfigured = false;
    this.consecutiveDeltaFrames = 0;
    
    if (this.webglRenderer) {
      try {
        this.webglRenderer.clear();
        this.log('WebGL 画布已清空', 'info');
      } catch (e) {
        this.log(`清空画布失败: ${e.message}`, 'error');
      }
    }
    
    this.requestKeyFrame();
    
    this.recoveryTimeout = setTimeout(() => {
      if (this.isRecovering) {
        this.log('恢复超时，再次请求关键帧', 'warning');
        this.requestKeyFrame();
        this.isRecovering = false;
      }
    }, 3000);
  }

  setupFrameCallback(receiver) {
    try {
      if (receiver.createVideoFrameDecoder) {
        this.log('使用 createVideoFrameDecoder', 'info');
      }
    } catch (e) {
      this.log('使用 MediaStreamTrack 回退方案', 'info');
      this.setupFallbackRendering(receiver.track);
    }
  }

  setupFallbackRendering(track) {
    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.srcObject = new MediaStream([track]);
    
    const canvas = document.getElementById('remoteCanvas');
    const ctx = canvas.getContext('2d');
    
    const render = () => {
      if (video.readyState >= 2) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
      }
      requestAnimationFrame(render);
    };
    render();
    
    this.log('已启用回退渲染方案（不使用 WebCodecs）', 'warning');
  }

  handleEncodedChunk(chunk) {
    this.frameCount++;
    this.timestamp = chunk.timestamp;
    this.lastFrameTime = Date.now();
    
    this.frameTimestamps.push({
      timestamp: chunk.timestamp,
      type: chunk.type,
      size: chunk.data.byteLength
    });
    
    if (this.frameTimestamps.length > this.maxFrameHistory) {
      this.frameTimestamps.shift();
    }
    
    if (chunk.type === 'key') {
      this.consecutiveDeltaFrames = 0;
      this.lastKeyFrameTime = Date.now();
      
      if (this.isRecovering) {
        this.isRecovering = false;
        if (this.recoveryTimeout) {
          clearTimeout(this.recoveryTimeout);
          this.recoveryTimeout = null;
        }
        this.log('收到关键帧，恢复完成!', 'success');
      }
      
      if (!this.isDecoderConfigured) {
        const width = 640;
        const height = 480;
        this.videoDecoder.configure(width, height);
        this.isDecoderConfigured = true;
      }
    } else {
      this.consecutiveDeltaFrames++;
    }
    
    if (this.isDecoderConfigured) {
      try {
        this.videoDecoder.decodeChunk(
          chunk.data, 
          chunk.timestamp, 
          chunk.type
        );
      } catch (e) {
        this.log(`解码帧失败: ${e.message}`, 'error');
        this.triggerRecovery();
      }
    } else if (chunk.type !== 'key' && !this.isRecovering) {
      this.log('收到P帧但解码器未配置，请求关键帧', 'warning');
      this.requestKeyFrame();
    }
  }

  setupSignalingHandlers() {
    this.signalingClient.on('offer', async (data) => {
      this.log(`收到来自 ${data.fromUserId} 的 Offer`, 'info');
      this.remoteUserId = data.fromUserId;
      this.isInitiator = false;
      
      await this.peerConnection.setRemoteDescription({
        type: 'offer',
        sdp: data.sdp
      });
      
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      
      this.signalingClient.sendAnswer(this.remoteUserId, answer);
      
      while (this.iceCandidatesQueue.length > 0) {
        const candidate = this.iceCandidatesQueue.shift();
        await this.peerConnection.addIceCandidate(candidate);
      }
    });

    this.signalingClient.on('answer', async (data) => {
      this.log(`收到来自 ${data.fromUserId} 的 Answer`, 'info');
      
      await this.peerConnection.setRemoteDescription({
        type: 'answer',
        sdp: data.sdp
      });
    });

    this.signalingClient.on('candidate', async (data) => {
      if (data.candidate) {
        if (this.peerConnection.remoteDescription) {
          await this.peerConnection.addIceCandidate(data.candidate);
        } else {
          this.iceCandidatesQueue.push(data.candidate);
        }
      }
    });

    this.signalingClient.on('svcLayerSwitch', async (data) => {
      this.log(`收到 SVC 层切换指令: ${data.layer}`, 'info');
      await this.switchSvcLayer(data.layer);
    });

    this.signalingClient.on('bandwidthStats', (data) => {
      this.bandwidthStats = data.stats;
      this.currentSvcLayer = data.currentLayer;
      
      if (this.onBandwidthUpdate) {
        this.onBandwidthUpdate({
          stats: data.stats,
          layer: data.currentLayer,
          layerConfig: data.layerConfig
        });
      }
    });
  }

  async switchSvcLayer(targetLayer) {
    if (!SVC_LAYERS[targetLayer]) {
      this.log(`无效的 SVC 层: ${targetLayer}`, 'error');
      return;
    }

    if (this.switchCooldown > 0) {
      this.log('切换冷却中，跳过', 'warning');
      return;
    }

    this.log(`切换 SVC 层: ${this.currentSvcLayer} -> ${targetLayer}`, 'info');
    this.targetSvcLayer = targetLayer;
    
    const layerConfig = SVC_LAYERS[targetLayer];
    
    try {
      if (this.videoSender) {
        const params = this.videoSender.getParameters();
        
        if (params.encodings && params.encodings.length > 0) {
          params.encodings[0].maxBitrate = layerConfig.bitrate;
          params.encodings[0].maxFramerate = layerConfig.fps;
          params.encodings[0].scaleResolutionDownBy = 
            layerConfig.resolution.width / 640 < 1 ? 
            640 / layerConfig.resolution.width : 1;
          
          await this.videoSender.setParameters(params);
          this.log(`编码参数已更新: ${(layerConfig.bitrate/1000).toFixed(0)} kbps, ${layerConfig.fps} fps`, 'success');
        }
      }
      
      const videoTrack = this.localStream?.getVideoTracks()[0];
      if (videoTrack && videoTrack.applyConstraints) {
        await videoTrack.applyConstraints({
          width: { ideal: layerConfig.resolution.width },
          height: { ideal: layerConfig.resolution.height },
          frameRate: { ideal: layerConfig.fps }
        });
        this.log(`视频采集参数已更新: ${layerConfig.resolution.width}x${layerConfig.resolution.height}`, 'success');
      }
      
      this.currentSvcLayer = targetLayer;
      this.switchCooldown = 30;
      this.bandwidthStats.layerChanges++;
      
      if (this.onSvcLayerChange) {
        this.onSvcLayerChange({
          oldLayer: this.currentSvcLayer,
          newLayer: targetLayer,
          layerConfig: layerConfig
        });
      }
      
    } catch (e) {
      this.log(`切换 SVC 层失败: ${e.message}`, 'error');
    }
  }

  getCurrentSvcInfo() {
    return {
      layer: this.currentSvcLayer,
      targetLayer: this.targetSvcLayer,
      layerConfig: SVC_LAYERS[this.currentSvcLayer],
      stats: this.bandwidthStats
    };
  }

  async call(targetUserId) {
    this.remoteUserId = targetUserId;
    this.isInitiator = true;
    
    const offer = await this.peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    });
    
    await this.peerConnection.setLocalDescription(offer);
    this.signalingClient.sendOffer(targetUserId, offer);
    this.log(`发起呼叫到 ${targetUserId}`, 'info');
  }

  hangup() {
    this.stopFrameMonitoring();
    this.stopBandwidthMonitoring();
    
    if (this.recoveryTimeout) {
      clearTimeout(this.recoveryTimeout);
      this.recoveryTimeout = null;
    }
    
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.remoteUserId = null;
    this.isInitiator = false;
    this.iceCandidatesQueue = [];
    this.isDecoderConfigured = false;
    this.isRecovering = false;
    this.consecutiveDeltaFrames = 0;
    this.frameTimestamps = [];
    this.videoReceiver = null;
    this.videoSender = null;
    this.decoderErrorHandler = null;
    
    this.currentSvcLayer = 'L1';
    this.targetSvcLayer = 'L1';
    this.switchCooldown = 0;
    this.frameBytesHistory = [];
    this.bytesSent = 0;
    this.bytesReceived = 0;
    
    this.log('已挂断', 'info');
  }

  log(message, type = 'info') {
    const logEl = document.getElementById('statusLog');
    if (logEl) {
      const entry = document.createElement('div');
      entry.className = `log-entry log-${type}`;
      entry.textContent = `[${new Date().toLocaleTimeString()}] [WebRTC] ${message}`;
      logEl.appendChild(entry);
      logEl.scrollTop = logEl.scrollHeight;
    }
    console.log(`[WebRTC] ${message}`);
  }
}

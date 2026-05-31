class App {
  constructor() {
    this.signalingClient = null;
    this.localRenderer = null;
    this.webglRenderer = null;
    this.videoDecoder = null;
    this.webrtcManager = null;
    this.localStream = null;
    this.currentLayer = 'L1';
    
    this.init();
  }

  async init() {
    this.setupEventListeners();
    
    try {
      this.signalingClient = new SignalingClient();
      await this.signalingClient.connect();
      
      this.signalingClient.on('peerList', (data) => {
        this.updatePeerList(data.peers);
      });
      
      this.log('系统初始化完成', 'success');
    } catch (e) {
      this.log(`初始化失败: ${e.message}`, 'error');
    }
  }

  setupEventListeners() {
    document.getElementById('registerBtn').addEventListener('click', () => {
      const userId = document.getElementById('userId').value.trim();
      if (userId) {
        this.register(userId);
      } else {
        this.log('请输入用户ID', 'warning');
      }
    });

    document.getElementById('getPeersBtn').addEventListener('click', () => {
      if (this.signalingClient) {
        this.signalingClient.getPeers();
      }
    });

    document.getElementById('callBtn').addEventListener('click', () => {
      const targetUserId = document.getElementById('targetUserId').value.trim();
      if (targetUserId) {
        this.call(targetUserId);
      } else {
        this.log('请输入目标用户ID', 'warning');
      }
    });

    document.getElementById('hangupBtn').addEventListener('click', () => {
      this.hangup();
    });

    document.getElementById('recoverBtn').addEventListener('click', () => {
      this.manualRecovery();
    });

    document.getElementById('layerL0').addEventListener('click', () => {
      this.manualSwitchLayer('L0');
    });

    document.getElementById('layerL1').addEventListener('click', () => {
      this.manualSwitchLayer('L1');
    });

    document.getElementById('layerL2').addEventListener('click', () => {
      this.manualSwitchLayer('L2');
    });

    this.updateLayerButtons(false);
  }

  async manualSwitchLayer(layer) {
    if (this.webrtcManager) {
      this.log(`手动切换到 ${layer} 层`, 'info');
      await this.webrtcManager.switchSvcLayer(layer);
      this.currentLayer = layer;
      this.updateLayerButtons(true);
    } else {
      this.log('请先建立连接', 'warning');
    }
  }

  updateBandwidthDisplay(data) {
    const { stats, layer, layerConfig } = data;
    
    document.getElementById('bitrateValue').textContent = 
      `${(stats.bitrate / 1000).toFixed(1)} kbps`;
    document.getElementById('packetLossValue').textContent = 
      `${(stats.packetLoss * 100).toFixed(2)}%`;
    document.getElementById('jitterValue').textContent = 
      `${(stats.jitter || 0).toFixed(2)} ms`;
    document.getElementById('rttValue').textContent = 
      `${(stats.rtt || 0).toFixed(2)} ms`;
    document.getElementById('svcLayerValue').textContent = layer;
    document.getElementById('svcLayerValue').className = `svc-layer layer-${layer}`;
    
    if (layerConfig) {
      document.getElementById('resolutionValue').textContent = 
        `${layerConfig.resolution.width}x${layerConfig.resolution.height}`;
    }
    
    this.currentLayer = layer;
    this.updateLayerButtons(true);
  }

  updateLayerButtons(enabled) {
    const layers = ['L0', 'L1', 'L2'];
    layers.forEach(layer => {
      const btn = document.getElementById(`layer${layer}`);
      if (btn) {
        btn.disabled = !enabled;
        btn.classList.toggle('active', layer === this.currentLayer);
      }
    });
  }

  async register(userId) {
    try {
      if (!this.localStream) {
        this.log('正在获取摄像头权限...', 'info');
        this.localRenderer = new LocalVideoRenderer(document.getElementById('localCanvas'));
        this.localStream = await this.localRenderer.start();
        this.log('摄像头已启用', 'success');
      }

      this.signalingClient.register(userId);
      
      const remoteCanvas = document.getElementById('remoteCanvas');
      this.webglRenderer = new WebGLRenderer(remoteCanvas);
      this.videoDecoder = new VideoDecoderManager(this.webglRenderer);
      
      this.webrtcManager = new WebRTCManager(this.signalingClient, this.videoDecoder);
      this.webrtcManager.webglRenderer = this.webglRenderer;
      
      this.webrtcManager.onBandwidthUpdate = (data) => {
        this.updateBandwidthDisplay(data);
      };
      
      this.webrtcManager.onSvcLayerChange = (data) => {
        this.log(`SVC 层切换: ${data.oldLayer} -> ${data.newLayer}`, 'success');
        this.currentLayer = data.newLayer;
        this.updateLayerButtons(true);
      };
      
      await this.webrtcManager.init(this.localStream);
      
      document.getElementById('callBtn').disabled = false;
      document.getElementById('hangupBtn').disabled = false;
      document.getElementById('recoverBtn').disabled = false;
      this.updateLayerButtons(true);
      
      this.signalingClient.getPeers();
    } catch (e) {
      this.log(`注册失败: ${e.message}`, 'error');
      console.error(e);
    }
  }

  updatePeerList(peers) {
    const peerListEl = document.getElementById('peerList');
    peerListEl.innerHTML = '';
    
    if (peers.length === 0) {
      peerListEl.innerHTML = '<span style="color: #888;">暂无在线用户</span>';
      return;
    }
    
    for (const peer of peers) {
      const peerItem = document.createElement('div');
      peerItem.className = 'peer-item';
      peerItem.textContent = peer;
      peerItem.addEventListener('click', () => {
        document.getElementById('targetUserId').value = peer;
      });
      peerListEl.appendChild(peerItem);
    }
  }

  async call(targetUserId) {
    if (this.webrtcManager) {
      await this.webrtcManager.call(targetUserId);
    }
  }

  hangup() {
    if (this.webrtcManager) {
      this.webrtcManager.hangup();
    }
    document.getElementById('recoverBtn').disabled = true;
    this.updateLayerButtons(false);
    
    document.getElementById('bitrateValue').textContent = '0 kbps';
    document.getElementById('packetLossValue').textContent = '0%';
    document.getElementById('jitterValue').textContent = '0 ms';
    document.getElementById('rttValue').textContent = '0 ms';
    document.getElementById('svcLayerValue').textContent = '-';
    document.getElementById('resolutionValue').textContent = '-';
  }

  manualRecovery() {
    if (this.webrtcManager) {
      this.log('用户触发手动恢复', 'info');
      this.webrtcManager.triggerRecovery();
    }
  }

  log(message, type = 'info') {
    const logEl = document.getElementById('statusLog');
    if (logEl) {
      const entry = document.createElement('div');
      entry.className = `log-entry log-${type}`;
      entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
      logEl.appendChild(entry);
      logEl.scrollTop = logEl.scrollHeight;
    }
    console.log(message);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new App();
});

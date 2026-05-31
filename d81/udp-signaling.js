class SignalingClient {
  constructor(serverUrl = 'ws://localhost:3000') {
    this.serverUrl = serverUrl;
    this.ws = null;
    this.messageHandlers = new Map();
    this.userId = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.serverUrl);
        
        this.ws.onopen = () => {
          this.log('信令服务器已连接', 'success');
          this.reconnectAttempts = 0;
          resolve(true);
        };
        
        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          } catch (e) {
            console.error('解析信令消息失败:', e);
          }
        };
        
        this.ws.onerror = (error) => {
          this.log(`连接错误`, 'error');
          reject(error);
        };
        
        this.ws.onclose = () => {
          this.log('信令连接已关闭', 'warning');
          this.attemptReconnect();
        };
      } catch (e) {
        this.log(`连接失败: ${e.message}`, 'error');
        reject(e);
      }
    });
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this.log(`尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`, 'warning');
      setTimeout(() => this.connect(), 2000);
    }
  }

  on(messageType, handler) {
    this.messageHandlers.set(messageType, handler);
  }

  handleMessage(data) {
    const handler = this.messageHandlers.get(data.type);
    if (handler) {
      handler(data);
    }
  }

  send(data) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.log('WebSocket 未连接', 'error');
      return false;
    }

    this.ws.send(JSON.stringify(data));
    return true;
  }

  register(userId) {
    this.userId = userId;
    this.send({
      type: 'register',
      userId: userId
    });
    this.log(`用户 ${userId} 已注册到信令服务器`, 'success');
  }

  getPeers() {
    this.send({
      type: 'getPeers'
    });
  }

  sendOffer(targetUserId, offer) {
    const success = this.send({
      type: 'offer',
      targetUserId: targetUserId,
      sdp: offer.sdp
    });
    if (success) {
      this.log(`发送 Offer 到 ${targetUserId}`, 'info');
    }
  }

  sendAnswer(targetUserId, answer) {
    const success = this.send({
      type: 'answer',
      targetUserId: targetUserId,
      sdp: answer.sdp
    });
    if (success) {
      this.log(`发送 Answer 到 ${targetUserId}`, 'info');
    }
  }

  sendCandidate(targetUserId, candidate) {
    this.send({
      type: 'candidate',
      targetUserId: targetUserId,
      candidate: candidate
    });
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
    console.log(`[Signaling] ${message}`);
  }

  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

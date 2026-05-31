class WeatherWebSocket {
  constructor() {
    this.ws = null;
    this.listeners = [];
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 15;
    this.reconnectDelay = 1500;
    this.pingInterval = null;
    this.pongTimeout = null;
    this.isManualClose = false;
    this.lastMessageTime = 0;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      console.log('WebSocket已连接或正在连接，跳过');
      return;
    }

    this.isManualClose = false;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const port = host === 'localhost' ? ':8000' : '';
    const wsUrl = `${protocol}//${host}${port}/ws/weather`;

    console.log(`正在连接WebSocket: ${wsUrl}`);
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket连接成功');
      this.reconnectAttempts = 0;
      this.lastMessageTime = Date.now();
      this.notifyListeners({ type: 'connected' });
      this.startHeartbeat();
    };

    this.ws.onmessage = (event) => {
      this.lastMessageTime = Date.now();
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'ping') {
          this.send({ type: 'pong' });
          return;
        }
        if (data.type === 'pong') {
          return;
        }
        this.notifyListeners(data);
      } catch (e) {
        console.error('解析WebSocket消息失败:', e);
      }
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket错误:', error);
      this.notifyListeners({ type: 'error', error });
    };

    this.ws.onclose = (event) => {
      console.log(`WebSocket连接关闭，代码: ${event.code}, 原因: ${event.reason}`);
      this.stopHeartbeat();
      this.notifyListeners({ type: 'disconnected' });
      
      if (!this.isManualClose) {
        this.attemptReconnect();
      }
    };
  }

  startHeartbeat() {
    this.stopHeartbeat();
    
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' });
      }
      
      const timeSinceLastMessage = Date.now() - this.lastMessageTime;
      if (timeSinceLastMessage > 45000) {
        console.warn('长时间未收到消息，尝试重连');
        this.reconnect();
      }
    }, 15000);
  }

  stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
  }

  reconnect() {
    this.stopHeartbeat();
    if (this.ws) {
      this.isManualClose = true;
      this.ws.close();
      this.ws = null;
    }
    setTimeout(() => {
      this.isManualClose = false;
      this.connect();
    }, 500);
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 30000);
      console.log(`尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})，延迟 ${Math.round(delay)}ms...`);
      setTimeout(() => {
        if (!this.isManualClose) {
          this.connect();
        }
      }, delay);
    } else {
      console.error('达到最大重连次数，停止重连');
      this.notifyListeners({ type: 'max_reconnect_reached' });
    }
  }

  addListener(callback) {
    this.listeners.push(callback);
  }

  removeListener(callback) {
    this.listeners = this.listeners.filter(l => l !== callback);
  }

  notifyListeners(data) {
    this.listeners.forEach(listener => {
      try {
        listener(data);
      } catch (e) {
        console.error('监听器执行失败:', e);
      }
    });
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(data));
      } catch (e) {
        console.error('发送消息失败:', e);
      }
    }
  }

  close() {
    this.isManualClose = true;
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const weatherWS = new WeatherWebSocket();

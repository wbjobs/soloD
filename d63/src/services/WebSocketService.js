class WebSocketService {
  constructor() {
    this.ws = null;
    this.url = null;
    this.connected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 1000;
    
    this.onOpen = null;
    this.onClose = null;
    this.onError = null;
    this.onMessage = null;
    this.onBitstream = null;
  }

  connect(url) {
    return new Promise((resolve, reject) => {
      this.url = url;
      
      try {
        this.ws = new WebSocket(url);
        this.ws.binaryType = 'arraybuffer';
        
        this.ws.onopen = () => {
          this.connected = true;
          this.reconnectAttempts = 0;
          if (this.onOpen) this.onOpen();
          resolve();
        };
        
        this.ws.onclose = (event) => {
          this.connected = false;
          if (this.onClose) this.onClose(event);
          
          if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            setTimeout(() => this.connect(url), this.reconnectDelay);
          }
        };
        
        this.ws.onerror = (error) => {
          if (this.onError) this.onError(error);
          reject(error);
        };
        
        this.ws.onmessage = (event) => {
          if (this.onMessage) this.onMessage(event.data);
        };
        
      } catch (error) {
        reject(error);
      }
    });
  }

  sendBitstream(bitstream) {
    if (!this.connected || !this.ws) {
      return false;
    }
    
    if (this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }
    
    try {
      this.ws.send(bitstream);
      if (this.onBitstream) this.onBitstream(bitstream);
      return true;
    } catch (error) {
      console.error('Failed to send bitstream:', error);
      return false;
    }
  }

  sendMetadata(metadata) {
    if (!this.connected || !this.ws) {
      return false;
    }
    
    try {
      const message = JSON.stringify({
        type: 'metadata',
        ...metadata
      });
      this.ws.send(message);
      return true;
    } catch (error) {
      console.error('Failed to send metadata:', error);
      return false;
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
    }
  }

  isConnected() {
    return this.connected && this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}

export default WebSocketService;

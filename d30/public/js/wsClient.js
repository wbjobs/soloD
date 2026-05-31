class WSClient {
    constructor(options = {}) {
        this.url = options.url || 'ws://localhost:8080';
        this.ws = null;
        this.sequence = 0;
        this.pendingRequests = new Map();
        this.responseQueue = [];
        this.expectedSequence = 0;
        this.onBlendshapes = options.onBlendshapes || (() => {});
        this.onConnect = options.onConnect || (() => {});
        this.onDisconnect = options.onDisconnect || (() => {});
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 500;
        this.isConnected = false;
        this.heartbeatInterval = null;
    }

    connect() {
        return new Promise((resolve, reject) => {
            try {
                this.ws = new WebSocket(this.url);
                
                this.ws.onopen = () => {
                    console.log('WebSocket connected');
                    this.isConnected = true;
                    this.reconnectAttempts = 0;
                    this.startHeartbeat();
                    this.onConnect();
                    resolve(true);
                };

                this.ws.onmessage = (event) => {
                    this.handleMessage(event.data);
                };

                this.ws.onerror = (error) => {
                    console.error('WebSocket error:', error);
                    reject(error);
                };

                this.ws.onclose = () => {
                    console.log('WebSocket disconnected');
                    this.isConnected = false;
                    this.stopHeartbeat();
                    this.onDisconnect();
                    this.attemptReconnect();
                };
            } catch (error) {
                reject(error);
            }
        });
    }

    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
            }
        }, 30000);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    attemptReconnect() {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
            console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms...`);
            setTimeout(() => this.connect(), delay);
        }
    }

    handleMessage(data) {
        try {
            const message = JSON.parse(data);
            
            if (message.type === 'pong') {
                const latency = Date.now() - message.timestamp;
                if (latency > 100) {
                    console.warn(`WebSocket latency: ${latency}ms`);
                }
                return;
            }

            if (message.type === 'blendshapes') {
                this.handleBlendshapesResponse(message);
            }
        } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
        }
    }

    handleBlendshapesResponse(message) {
        const { sequence, blendshapes, timestamp, emotion } = message;
        
        if (sequence === this.expectedSequence) {
            this.onBlendshapes(blendshapes, timestamp, emotion);
            this.expectedSequence++;
            
            this.processQueuedResponses();
        } else if (sequence > this.expectedSequence) {
            this.responseQueue.push(message);
            this.responseQueue.sort((a, b) => a.sequence - b.sequence);
            
            if (this.responseQueue.length > 10) {
                console.warn('Response queue growing, possible out-of-sync condition');
            }
        }
    }

    processQueuedResponses() {
        while (this.responseQueue.length > 0) {
            const nextMessage = this.responseQueue[0];
            if (nextMessage.sequence === this.expectedSequence) {
                this.responseQueue.shift();
                this.onBlendshapes(nextMessage.blendshapes, nextMessage.timestamp, nextMessage.emotion);
                this.expectedSequence++;
            } else {
                break;
            }
        }
    }

    sendAudioFeatures(mfcc, timestamp, emotion = null) {
        if (!this.isConnected || this.ws.readyState !== WebSocket.OPEN) {
            return false;
        }

        const currentSequence = this.sequence++;
        const message = {
            type: 'audio_features',
            sequence: currentSequence,
            mfcc: mfcc,
            timestamp: timestamp,
            emotion: emotion
        };

        try {
            this.ws.send(JSON.stringify(message));
            return true;
        } catch (error) {
            console.error('Failed to send audio features:', error);
            return false;
        }
    }

    disconnect() {
        this.stopHeartbeat();
        if (this.ws) {
            this.ws.close();
        }
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = WSClient;
}

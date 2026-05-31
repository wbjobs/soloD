export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface WebSocketStreamConfig {
    url: string;
    onConnect?: () => void;
    onDisconnect?: () => void;
    onError?: (error: Error) => void;
    onBitstreamSent?: (bytes: number) => void;
}

export class WebSocketStream {
    private socket: WebSocket | null = null;
    private config: WebSocketStreamConfig;
    private status: ConnectionStatus = 'disconnected';
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 5;
    private reconnectDelay: number = 1000;

    constructor(config: WebSocketStreamConfig) {
        this.config = config;
    }

    connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.status === 'connected') {
                resolve();
                return;
            }

            this.status = 'connecting';
            
            try {
                this.socket = new WebSocket(this.config.url);
                this.socket.binaryType = 'arraybuffer';

                this.socket.onopen = () => {
                    this.status = 'connected';
                    this.reconnectAttempts = 0;
                    this.config.onConnect?.();
                    resolve();
                };

                this.socket.onclose = (event) => {
                    this.status = 'disconnected';
                    this.config.onDisconnect?.();
                    
                    if (event.wasClean === false && this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++;
                        setTimeout(() => {
                            this.connect().catch(() => {});
                        }, this.reconnectDelay * this.reconnectAttempts);
                    }
                };

                this.socket.onerror = (error) => {
                    this.status = 'error';
                    const err = new Error('WebSocket connection error');
                    this.config.onError?.(err);
                    reject(err);
                };

                this.socket.onmessage = (event) => {
                };
            } catch (error) {
                this.status = 'error';
                reject(error);
            }
        });
    }

    sendBitstream(bitstream: Uint8Array): boolean {
        if (!this.socket || this.status !== 'connected') {
            return false;
        }

        try {
            const header = new Uint8Array(8);
            const view = new DataView(header.buffer);
            view.setUint32(0, bitstream.length, true);
            view.setUint32(4, Date.now(), true);

            const message = new Uint8Array(header.length + bitstream.length);
            message.set(header, 0);
            message.set(bitstream, header.length);

            this.socket.send(message);
            this.config.onBitstreamSent?.(bitstream.length);
            return true;
        } catch (error) {
            console.error('Failed to send bitstream:', error);
            return false;
        }
    }

    sendStats(stats: {
        frameCount: number;
        bitsEncoded: number;
        bitrate: number;
    }): boolean {
        if (!this.socket || this.status !== 'connected') {
            return false;
        }

        try {
            const message = JSON.stringify({ type: 'stats', ...stats });
            this.socket.send(message);
            return true;
        } catch (error) {
            console.error('Failed to send stats:', error);
            return false;
        }
    }

    disconnect(): void {
        if (this.socket) {
            this.socket.close(1000, 'Client disconnect');
            this.socket = null;
        }
        this.status = 'disconnected';
    }

    getStatus(): ConnectionStatus {
        return this.status;
    }

    isConnected(): boolean {
        return this.status === 'connected';
    }
}

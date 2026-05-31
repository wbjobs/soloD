import { io, Socket } from 'socket.io-client';
import { NetworkStats, BitrateRecommendation } from '../types/webrtc';

class SignalingService {
  private socket: Socket | null = null;
  private userId: string = '';
  private roomId: string = '';
  private eventListeners: Map<string, Function[]> = new Map();

  connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = io(url, { transports: ['websocket'] });
      
      this.socket.on('connect', () => {
        console.log('已连接到信令服务器');
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('连接信令服务器失败:', error);
        reject(error);
      });

      this.socket.on('offer', (data) => {
        this.emit('offer', data);
      });

      this.socket.on('answer', (data) => {
        this.emit('answer', data);
      });

      this.socket.on('ice-candidate', (data) => {
        this.emit('ice-candidate', data);
      });

      this.socket.on('user-joined', (data) => {
        this.emit('user-joined', data);
      });

      this.socket.on('user-left', (data) => {
        this.emit('user-left', data);
      });

      this.socket.on('room-users', (data) => {
        this.emit('room-users', data);
      });

      this.socket.on('bitrate-recommendation', (recommendation: BitrateRecommendation) => {
        this.emit('bitrate-recommendation', recommendation);
      });
    });
  }

  joinRoom(roomId: string, userId: string): void {
    this.roomId = roomId;
    this.userId = userId;
    this.socket?.emit('join-room', { roomId, userId });
  }

  leaveRoom(): void {
    this.socket?.emit('leave-room', { roomId: this.roomId, userId: this.userId });
  }

  sendOffer(targetId: string, offer: RTCSessionDescriptionInit): void {
    this.socket?.emit('offer', {
      userId: this.userId,
      targetId,
      offer,
      roomId: this.roomId
    });
  }

  sendAnswer(targetId: string, answer: RTCSessionDescriptionInit): void {
    this.socket?.emit('answer', {
      userId: this.userId,
      targetId,
      answer,
      roomId: this.roomId
    });
  }

  sendIceCandidate(targetId: string, candidate: RTCIceCandidate): void {
    this.socket?.emit('ice-candidate', {
      userId: this.userId,
      targetId,
      candidate,
      roomId: this.roomId
    });
  }

  sendStatsReport(stats: NetworkStats): void {
    this.socket?.emit('stats-report', {
      roomId: this.roomId,
      userId: this.userId,
      stats
    });
  }

  on(event: string, callback: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event)?.push(callback);
  }

  off(event: string, callback?: Function): void {
    if (!callback) {
      this.eventListeners.delete(event);
    } else {
      const listeners = this.eventListeners.get(event);
      if (listeners) {
        const index = listeners.indexOf(callback);
        if (index > -1) {
          listeners.splice(index, 1);
        }
      }
    }
  }

  private emit(event: string, data: any): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.forEach(callback => callback(data));
    }
  }

  disconnect(): void {
    this.socket?.disconnect();
    this.eventListeners.clear();
  }

  getUserId(): string {
    return this.userId;
  }

  getRoomId(): string {
    return this.roomId;
  }
}

export default new SignalingService();

import { Injectable, NgZone, OnDestroy } from '@angular/core';
import { Client, Message } from 'stompjs';
import SockJS from 'sockjs-client';
import { Subject, Observable, timer, Subscription } from 'rxjs';
import { bufferTime, filter, takeUntil } from 'rxjs/operators';
import { TickData } from '../models/tick-data.model';
import { AggregatedData } from '../models/aggregated-data.model';
import { Alert } from '../models/alert.model';

interface QueuedMessage<T> {
  data: T;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class WebsocketService implements OnDestroy {
  private stompClient: Client | null = null;
  private destroy$ = new Subject<void>();
  private connectedSubject = new Subject<boolean>();
  private isConnected = false;
  
  private tickDataSubject = new Subject<TickData>();
  private aggregatedDataSubject = new Subject<AggregatedData>();
  private alertsSubject = new Subject<Alert>();

  private tickBuffer: Map<string, TickData> = new Map();
  private flushSubscription: Subscription | null = null;
  
  private maxQueueSize = 1000;
  private droppedMessages = 0;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  tickData$ = this.tickDataSubject.asObservable();
  aggregatedData$ = this.aggregatedDataSubject.asObservable();
  alerts$ = this.alertsSubject.asObservable();
  connected$ = this.connectedSubject.asObservable();

  constructor(private ngZone: NgZone) {}

  connect(): void {
    this.ngZone.runOutsideAngular(() => {
      this.attemptConnection();
    });
  }

  private attemptConnection(): void {
    if (this.isConnected) return;

    const socket = new SockJS('http://localhost:8080/ws');
    this.stompClient = new Client();
    this.stompClient.webSocketFactory = () => socket;
    this.stompClient.heartbeat.outgoing = 10000;
    this.stompClient.heartbeat.incoming = 10000;

    this.stompClient.connect({}, () => {
      this.onConnect();
    }, (error: any) => {
      console.error('WebSocket connection error:', error);
      this.onDisconnect();
      this.scheduleReconnect();
    });
  }

  private onConnect(): void {
    this.isConnected = true;
    this.reconnectAttempts = 0;
    this.connectedSubject.next(true);
    
    this.startFlushTimer();
    
    this.stompClient?.subscribe('/topic/ticks', (message: Message) => {
      try {
        const data = JSON.parse(message.body);
        this.bufferTickData(data);
      } catch (e) {
        console.error('Error parsing tick data:', e);
      }
    });

    this.stompClient?.subscribe('/topic/aggregated', (message: Message) => {
      try {
        const data = JSON.parse(message.body);
        this.aggregatedDataSubject.next(data);
      } catch (e) {
        console.error('Error parsing aggregated data:', e);
      }
    });

    this.stompClient?.subscribe('/topic/alerts', (message: Message) => {
      try {
        const data = JSON.parse(message.body);
        this.alertsSubject.next(data);
      } catch (e) {
        console.error('Error parsing alert data:', e);
      }
    });
  }

  private bufferTickData(data: TickData): void {
    if (this.tickBuffer.size >= this.maxQueueSize) {
      this.droppedMessages++;
      if (this.droppedMessages % 100 === 0) {
        console.warn(`Dropped ${this.droppedMessages} tick messages due to backpressure`);
      }
      return;
    }
    
    this.tickBuffer.set(data.symbol, data);
  }

  private startFlushTimer(): void {
    this.stopFlushTimer();
    this.flushSubscription = timer(0, 100)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.flushTickBuffer();
      });
  }

  private stopFlushTimer(): void {
    if (this.flushSubscription) {
      this.flushSubscription.unsubscribe();
      this.flushSubscription = null;
    }
  }

  private flushTickBuffer(): void {
    if (this.tickBuffer.size === 0) return;
    
    const ticks = Array.from(this.tickBuffer.values());
    this.tickBuffer.clear();
    
    this.ngZone.run(() => {
      ticks.forEach(tick => this.tickDataSubject.next(tick));
    });
  }

  private onDisconnect(): void {
    this.isConnected = false;
    this.stopFlushTimer();
    this.connectedSubject.next(false);
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;
    
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      if (!this.isConnected) {
        this.attemptConnection();
      }
    }, delay);
  }

  disconnect(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.stopFlushTimer();
    
    if (this.stompClient) {
      this.stompClient.disconnect(() => {
        this.onDisconnect();
      });
    }
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}

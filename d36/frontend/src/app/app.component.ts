import { Component, OnInit, OnDestroy } from '@angular/core';
import { WebsocketService } from './services/websocket.service';
import { TickData } from './models/tick-data.model';
import { AggregatedData } from './models/aggregated-data.model';
import { Alert } from './models/alert.model';
import { BacktestResult } from './models/backtest.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-root',
  template: `
    <div class="app-container">
      <header class="header">
        <h1>📊 金融数据实时处理平台</h1>
        <p>基于 Spring Boot + Apache Flink + Kafka + Angular 的高性能实时数据流解决方案</p>
      </header>

      <div class="tab-container">
        <button 
          *ngFor="let tab of tabs" 
          class="tab-btn"
          [class.active]="activeTab === tab.id"
          (click)="activeTab = tab.id"
        >
          {{ tab.name }}
        </button>
      </div>

      <div *ngIf="activeTab === 'realtime'" class="dashboard">
        <div class="status-indicator" *ngIf="isConnected">
          <span class="status-dot"></span>
          <span class="status-text">实时数据连接正常</span>
        </div>

        <div class="card">
          <h2>📈 实时股票数据</h2>
          <div class="symbol-selector">
            <button 
              *ngFor="let symbol of symbols" 
              class="symbol-btn"
              [class.active]="selectedSymbol === symbol"
              (click)="selectSymbol(symbol)"
            >
              {{ symbol }}
            </button>
          </div>
          <div class="tick-display">
            <div *ngFor="let tick of latestTicks | keyvalue" class="tick-item">
              <div class="tick-symbol">{{ tick.key }}</div>
              <div class="tick-price">{{ tick.value.price | number:'1.2-2' }}</div>
              <div class="tick-volume">成交量: {{ tick.value.volume | number }}</div>
            </div>
          </div>
        </div>

        <div class="card">
          <h2>🕯️ K线图 (1分钟 VWAP)</h2>
          <div class="symbol-selector">
            <button 
              *ngFor="let symbol of symbols" 
              class="symbol-btn"
              [class.active]="selectedSymbol === symbol"
              (click)="selectSymbol(symbol)"
            >
              {{ symbol }}
            </button>
          </div>
          <app-candlestick-chart 
            [data]="aggregatedData" 
            [symbol]="selectedSymbol"
          ></app-candlestick-chart>
        </div>

        <div class="card">
          <h2>⚠️ 异常波动警报</h2>
          <div class="alerts-container">
            <div *ngFor="let alert of alerts" class="alert-item">
              <div class="alert-header">
                <span class="alert-symbol">{{ alert.symbol }}</span>
                <span class="alert-time">{{ formatTime(alert.timestamp) }}</span>
              </div>
              <div class="alert-message">{{ alert.message }}</div>
            </div>
            <div *ngIf="alerts.length === 0" style="color: #8892b0; text-align: center; padding: 40px;">
              暂无异常波动警报
            </div>
          </div>
        </div>

        <div class="card">
          <h2>📋 系统概览</h2>
          <div style="display: grid; gap: 20px;">
            <div style="background: rgba(0, 217, 255, 0.1); padding: 20px; border-radius: 10px;">
              <div style="color: #8892b0; font-size: 0.9em;">已接收 Tick 数据</div>
              <div style="color: #00d9ff; font-size: 2em; font-weight: bold;">{{ tickCount }}</div>
            </div>
            <div style="background: rgba(0, 255, 136, 0.1); padding: 20px; border-radius: 10px;">
              <div style="color: #8892b0; font-size: 0.9em;">聚合数据点</div>
              <div style="color: #00ff88; font-size: 2em; font-weight: bold;">{{ aggregatedData.length }}</div>
            </div>
            <div style="background: rgba(255, 107, 107, 0.1); padding: 20px; border-radius: 10px;">
              <div style="color: #8892b0; font-size: 0.9em;">异常警报数</div>
              <div style="color: #ff6b6b; font-size: 2em; font-weight: bold;">{{ alerts.length }}</div>
            </div>
          </div>
        </div>
      </div>

      <div *ngIf="activeTab === 'backtest'" class="dashboard">
        <div style="grid-column: 1 / -1;">
          <app-backtest-form (backtestRun)="onBacktestResult($event)"></app-backtest-form>
        </div>
        
        <div style="grid-column: 1 / -1;" *ngIf="backtestResult">
          <app-backtest-result [result]="backtestResult"></app-backtest-result>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .tab-container {
      display: flex;
      gap: 8px;
      margin-bottom: 20px;
      border-bottom: 2px solid #16537e;
      padding-bottom: 10px;
    }

    .tab-btn {
      padding: 10px 24px;
      background: rgba(15, 52, 96, 0.5);
      color: #8892b0;
      border: 2px solid transparent;
      border-radius: 8px;
      cursor: pointer;
      font-size: 1em;
      font-weight: 500;
      transition: all 0.3s;
    }

    .tab-btn:hover {
      background: rgba(0, 217, 255, 0.1);
      color: #00d9ff;
    }

    .tab-btn.active {
      background: linear-gradient(135deg, #00d9ff 0%, #0099cc 100%);
      color: white;
      border-color: #00d9ff;
    }
  `]
})
export class AppComponent implements OnInit, OnDestroy {
  private subscriptions: Subscription = new Subscription();
  isConnected = false;
  symbols = ['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'BABA'];
  selectedSymbol = 'AAPL';
  latestTicks: Map<string, TickData> = new Map();
  aggregatedData: AggregatedData[] = [];
  alerts: Alert[] = [];
  tickCount = 0;

  tabs = [
    { id: 'realtime', name: '📊 实时行情' },
    { id: 'backtest', name: '📈 策略回测' }
  ];
  activeTab = 'realtime';
  backtestResult: BacktestResult | null = null;

  constructor(private websocketService: WebsocketService) {}

  ngOnInit(): void {
    this.websocketService.connect();

    this.subscriptions.add(
      this.websocketService.connected$.subscribe(connected => {
        this.isConnected = connected;
      })
    );

    this.subscriptions.add(
      this.websocketService.tickData$.subscribe(tick => {
        this.latestTicks.set(tick.symbol, tick);
        this.tickCount++;
      })
    );

    this.subscriptions.add(
      this.websocketService.aggregatedData$.subscribe(data => {
        this.aggregatedData.push(data);
        if (this.aggregatedData.length > 100) {
          this.aggregatedData.shift();
        }
      })
    );

    this.subscriptions.add(
      this.websocketService.alerts$.subscribe(alert => {
        this.alerts.unshift(alert);
        if (this.alerts.length > 50) {
          this.alerts.pop();
        }
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    this.websocketService.disconnect();
  }

  selectSymbol(symbol: string): void {
    this.selectedSymbol = symbol;
  }

  formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('zh-CN');
  }

  onBacktestResult(result: BacktestResult): void {
    this.backtestResult = result;
  }
}

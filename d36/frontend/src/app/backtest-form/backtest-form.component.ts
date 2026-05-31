import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { BacktestService } from '../services/backtest.service';
import { StrategyConfig } from '../models/backtest.model';

@Component({
  selector: 'app-backtest-form',
  template: `
    <div class="card">
      <h2>📊 策略回测配置</h2>
      
      <form [formGroup]="backtestForm" (ngSubmit)="onSubmit()" class="form-container">
        <div class="form-row">
          <div class="form-group">
            <label>股票代码</label>
            <select formControlName="symbol" class="form-control">
              <option *ngFor="let symbol of symbols" [value]="symbol">{{ symbol }}</option>
            </select>
          </div>
          
          <div class="form-group">
            <label>策略类型</label>
            <select formControlName="type" class="form-control" (change)="onStrategyChange()">
              <option *ngFor="let strategy of strategyList" [value]="strategy">{{ strategyNames[strategy] }}</option>
            </select>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label>初始资金</label>
            <input type="number" formControlName="initialCapital" class="form-control">
          </div>
          
          <div class="form-group">
            <label>手续费率 (%)</label>
            <input type="number" formControlName="transactionFeeRate" step="0.01" class="form-control">
          </div>
          
          <div class="form-group">
            <label>滑点率 (%)</label>
            <input type="number" formControlName="slippageRate" step="0.01" class="form-control">
          </div>
        </div>

        <div *ngIf="backtestForm.value.type === 'MA_CROSSOVER'" class="form-row">
          <div class="form-group">
            <label>短期均线周期</label>
            <input type="number" formControlName="maShortPeriod" class="form-control">
          </div>
          <div class="form-group">
            <label>长期均线周期</label>
            <input type="number" formControlName="maLongPeriod" class="form-control">
          </div>
        </div>

        <div *ngIf="backtestForm.value.type === 'RSI'" class="form-row">
          <div class="form-group">
            <label>RSI周期</label>
            <input type="number" formControlName="rsiPeriod" class="form-control">
          </div>
          <div class="form-group">
            <label>超买阈值</label>
            <input type="number" formControlName="rsiOverbought" class="form-control">
          </div>
          <div class="form-group">
            <label>超卖阈值</label>
            <input type="number" formControlName="rsiOversold" class="form-control">
          </div>
        </div>

        <div *ngIf="backtestForm.value.type === 'BOLLINGER_BANDS'" class="form-row">
          <div class="form-group">
            <label>周期</label>
            <input type="number" formControlName="bbPeriod" class="form-control">
          </div>
          <div class="form-group">
            <label>标准差倍数</label>
            <input type="number" formControlName="bbStdDev" step="0.1" class="form-control">
          </div>
        </div>

        <div *ngIf="backtestForm.value.type === 'MACD'" class="form-row">
          <div class="form-group">
            <label>快线周期</label>
            <input type="number" formControlName="macdFastPeriod" class="form-control">
          </div>
          <div class="form-group">
            <label>慢线周期</label>
            <input type="number" formControlName="macdSlowPeriod" class="form-control">
          </div>
          <div class="form-group">
            <label>信号周期</label>
            <input type="number" formControlName="macdSignalPeriod" class="form-control">
          </div>
        </div>

        <div *ngIf="backtestForm.value.type === 'KDJ'" class="form-row">
          <div class="form-group">
            <label>N周期</label>
            <input type="number" formControlName="kdjN" class="form-control">
          </div>
          <div class="form-group">
            <label>M1周期</label>
            <input type="number" formControlName="kdjM1" class="form-control">
          </div>
          <div class="form-group">
            <label>M2周期</label>
            <input type="number" formControlName="kdjM2" class="form-control">
          </div>
        </div>

        <button type="submit" class="btn-submit" [disabled]="isRunning">
          {{ isRunning ? '⏳ 计算中...' : '🚀 运行回测' }}
        </button>
      </form>
    </div>
  `,
  styles: [`
    .form-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .form-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 16px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .form-group label {
      color: #8892b0;
      font-size: 0.9em;
      font-weight: 500;
    }

    .form-control {
      padding: 10px 12px;
      border: 1px solid #16537e;
      border-radius: 8px;
      background: rgba(15, 52, 96, 0.5);
      color: #e4e4e4;
      font-size: 1em;
      transition: border-color 0.3s;
    }

    .form-control:focus {
      outline: none;
      border-color: #00d9ff;
    }

    .form-control::placeholder {
      color: #55607a;
    }

    .btn-submit {
      padding: 14px 24px;
      background: linear-gradient(135deg, #00d9ff 0%, #0099cc 100%);
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 1.1em;
      font-weight: 600;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
      margin-top: 8px;
    }

    .btn-submit:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(0, 217, 255, 0.3);
    }

    .btn-submit:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  `]
})
export class BacktestFormComponent implements OnInit {
  @Output() backtestRun = new EventEmitter<any>();
  
  backtestForm: FormGroup;
  symbols: string[] = [];
  strategyList: string[] = [];
  isRunning = false;

  strategyNames: { [key: string]: string } = {
    MA_CROSSOVER: '均线交叉',
    RSI: 'RSI指标',
    BOLLINGER_BANDS: '布林带',
    MACD: 'MACD',
    KDJ: 'KDJ'
  };

  constructor(
    private fb: FormBuilder,
    private backtestService: BacktestService
  ) {
    this.backtestForm = this.fb.group({
      symbol: ['AAPL'],
      type: ['MA_CROSSOVER'],
      initialCapital: [100000],
      transactionFeeRate: [0.001],
      slippageRate: [0.001],
      maShortPeriod: [5],
      maLongPeriod: [20],
      rsiPeriod: [14],
      rsiOverbought: [70],
      rsiOversold: [30],
      bbPeriod: [20],
      bbStdDev: [2],
      macdFastPeriod: [12],
      macdSlowPeriod: [26],
      macdSignalPeriod: [9],
      kdjN: [9],
      kdjM1: [3],
      kdjM2: [3]
    });
  }

  ngOnInit(): void {
    this.backtestService.getSymbols().subscribe(symbols => {
      this.symbols = symbols;
    });

    this.backtestService.getStrategies().subscribe(strategies => {
      this.strategyList = strategies;
    });
  }

  onStrategyChange(): void {}

  onSubmit(): void {
    if (this.backtestForm.invalid) return;
    
    this.isRunning = true;
    const config: StrategyConfig = this.backtestForm.value;
    
    this.backtestService.runBacktest(config).subscribe({
      next: (result) => {
        this.backtestRun.emit(result);
        this.isRunning = false;
      },
      error: (error) => {
        console.error('Backtest error:', error);
        this.isRunning = false;
      }
    });
  }
}

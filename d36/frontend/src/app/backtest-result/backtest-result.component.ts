import { Component, Input, OnChanges, SimpleChanges, ElementRef, ViewChild } from '@angular/core';
import * as d3 from 'd3';
import { BacktestResult, EquityPoint } from '../models/backtest.model';

@Component({
  selector: 'app-backtest-result',
  template: `
    <div class="card" *ngIf="result">
      <h2>📈 回测结果 - {{ result.symbol }}</h2>
      
      <div class="metrics-grid">
        <div class="metric-card" [class.positive]="result.totalReturn >= 0" [class.negative]="result.totalReturn < 0">
          <div class="metric-label">总收益率</div>
          <div class="metric-value">{{ result.totalReturn.toFixed(2) }}%</div>
        </div>
        
        <div class="metric-card">
          <div class="metric-label">年化收益率</div>
          <div class="metric-value">{{ result.annualizedReturn.toFixed(2) }}%</div>
        </div>
        
        <div class="metric-card negative">
          <div class="metric-label">最大回撤</div>
          <div class="metric-value">-{{ result.maxDrawdown.toFixed(2) }}%</div>
        </div>
        
        <div class="metric-card">
          <div class="metric-label">夏普比率</div>
          <div class="metric-value">{{ result.sharpeRatio.toFixed(2) }}</div>
        </div>
        
        <div class="metric-card">
          <div class="metric-label">胜率</div>
          <div class="metric-value">{{ result.winRate.toFixed(2) }}%</div>
        </div>
        
        <div class="metric-card">
          <div class="metric-label">交易次数</div>
          <div class="metric-value">{{ result.totalTrades }}</div>
        </div>
        
        <div class="metric-card positive">
          <div class="metric-label">平均盈利</div>
          <div class="metric-value">+{{ result.avgWin.toFixed(2) }}%</div>
        </div>
        
        <div class="metric-card negative">
          <div class="metric-label">平均亏损</div>
          <div class="metric-value">-{{ result.avgLoss.toFixed(2) }}%</div>
        </div>
        
        <div class="metric-card">
          <div class="metric-label">盈亏比</div>
          <div class="metric-value">{{ result.profitFactor.toFixed(2) }}</div>
        </div>
        
        <div class="metric-card">
          <div class="metric-label">初始资金</div>
          <div class="metric-value">¥{{ result.initialCapital.toLocaleString() }}</div>
        </div>
        
        <div class="metric-card">
          <div class="metric-label">最终资金</div>
          <div class="metric-value">¥{{ result.finalCapital.toLocaleString() }}</div>
        </div>
        
        <div class="metric-card">
          <div class="metric-label">盈利/亏损</div>
          <div class="metric-value">{{ result.winningTrades }}/{{ result.losingTrades }}</div>
        </div>
      </div>

      <div style="margin-top: 24px;">
        <h3 style="margin-bottom: 16px; color: #8892b0;">资金曲线</h3>
        <div #equityChart class="chart-container"></div>
      </div>

      <div style="margin-top: 24px;">
        <h3 style="margin-bottom: 16px; color: #8892b0;">交易记录</h3>
        <div class="trades-table">
          <div class="trade-header">
            <span>时间</span>
            <span>类型</span>
            <span>价格</span>
            <span>数量</span>
            <span>金额</span>
          </div>
          <div class="trade-row" *ngFor="let trade of result.trades.slice(-20)">
            <span>{{ formatTime(trade.time) }}</span>
            <span [class.buy]="trade.type === 'BUY'" [class.sell]="trade.type === 'SELL'">{{ trade.type === 'BUY' ? '买入' : '卖出' }}</span>
            <span>{{ trade.price.toFixed(2) }}</span>
            <span>{{ trade.quantity }}</span>
            <span>¥{{ trade.netAmount.toLocaleString() }}</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 12px;
    }

    .metric-card {
      background: rgba(15, 52, 96, 0.6);
      padding: 16px;
      border-radius: 10px;
      border-left: 3px solid #00d9ff;
      transition: transform 0.2s;
    }

    .metric-card:hover {
      transform: translateY(-2px);
    }

    .metric-card.positive {
      border-left-color: #00ff88;
    }

    .metric-card.negative {
      border-left-color: #ff6b6b;
    }

    .metric-label {
      color: #8892b0;
      font-size: 0.85em;
      margin-bottom: 6px;
    }

    .metric-value {
      font-size: 1.3em;
      font-weight: 700;
      color: #e4e4e4;
    }

    .positive .metric-value {
      color: #00ff88;
    }

    .negative .metric-value {
      color: #ff6b6b;
    }

    .trades-table {
      max-height: 300px;
      overflow-y: auto;
      border-radius: 8px;
      overflow: hidden;
    }

    .trade-header {
      display: grid;
      grid-template-columns: 2fr 1fr 1fr 1fr 1fr;
      gap: 8px;
      padding: 12px 16px;
      background: rgba(15, 52, 96, 0.8);
      color: #8892b0;
      font-weight: 600;
      font-size: 0.9em;
      position: sticky;
      top: 0;
    }

    .trade-row {
      display: grid;
      grid-template-columns: 2fr 1fr 1fr 1fr 1fr;
      gap: 8px;
      padding: 10px 16px;
      border-bottom: 1px solid rgba(22, 83, 126, 0.3);
      font-size: 0.9em;
      color: #e4e4e4;
    }

    .trade-row:hover {
      background: rgba(0, 217, 255, 0.1);
    }

    .trade-row .buy {
      color: #00ff88;
      font-weight: 600;
    }

    .trade-row .sell {
      color: #ff6b6b;
      font-weight: 600;
    }

    .chart-container {
      height: 350px;
    }
  `]
})
export class BacktestResultComponent implements OnChanges {
  @Input() result: BacktestResult | null = null;
  @ViewChild('equityChart') equityChart!: ElementRef;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['result'] && this.result) {
      setTimeout(() => this.drawEquityChart(), 100);
    }
  }

  private drawEquityChart(): void {
    if (!this.equityChart || !this.result) return;

    const element = this.equityChart.nativeElement;
    const margin = { top: 20, right: 30, bottom: 40, left: 60 };
    const width = element.clientWidth - margin.left - margin.right;
    const height = element.clientHeight - margin.top - margin.bottom;

    d3.select(element).selectAll('*').remove();

    const svg = d3.select(element)
      .append('svg')
      .attr('width', element.clientWidth)
      .attr('height', element.clientHeight)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const data: EquityPoint[] = this.result.equityCurve.map(d => ({
      ...d,
      time: new Date(d.time)
    }));

    const x = d3.scaleTime()
      .domain(d3.extent(data, d => d.time) as [Date, Date])
      .range([0, width]);

    const y = d3.scaleLinear()
      .domain([
        d3.min(data, d => d.equity) as number * 0.995,
        d3.max(data, d => d.equity) as number * 1.005
      ])
      .range([height, 0]);

    const xAxis = d3.axisBottom(x)
      .ticks(8)
      .tickFormat(d3.timeFormat('%m-%d %H:%M') as any);

    const yAxis = d3.axisLeft(y)
      .ticks(8)
      .tickFormat(d => '¥' + (d as number).toLocaleString());

    svg.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(xAxis)
      .selectAll('text')
      .style('fill', '#8892b0')
      .style('font-size', '11px');

    svg.append('g')
      .call(yAxis)
      .selectAll('text')
      .style('fill', '#8892b0')
      .style('font-size', '11px');

    const grid = d3.axisLeft(y)
      .tickSize(-width)
      .tickFormat(() => '');

    svg.append('g')
      .call(grid)
      .selectAll('.tick line')
      .attr('stroke', '#16537e')
      .attr('stroke-opacity', 0.3);

    const line = d3.line<EquityPoint>()
      .x(d => x(d.time))
      .y(d => y(d.equity))
      .curve(d3.curveMonotoneX);

    const gradient = svg.append('defs')
      .append('linearGradient')
      .attr('id', 'equityGradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');

    gradient.append('stop')
      .attr('offset', '0%')
      .attr('stop-color', '#00d9ff')
      .attr('stop-opacity', 0.3);

    gradient.append('stop')
      .attr('offset', '100%')
      .attr('stop-color', '#00d9ff')
      .attr('stop-opacity', 0);

    const area = d3.area<EquityPoint>()
      .x(d => x(d.time))
      .y0(height)
      .y1(d => y(d.equity))
      .curve(d3.curveMonotoneX);

    svg.append('path')
      .data([data])
      .attr('class', 'area')
      .attr('d', area)
      .style('fill', 'url(#equityGradient)');

    svg.append('path')
      .data([data])
      .attr('class', 'line')
      .attr('d', line)
      .style('fill', 'none')
      .style('stroke', '#00d9ff')
      .style('stroke-width', 2.5);

    const initialEquity = this.result.initialCapital;
    svg.append('line')
      .attr('x1', 0)
      .attr('x2', width)
      .attr('y1', y(initialEquity))
      .attr('y2', y(initialEquity))
      .style('stroke', '#8892b0')
      .style('stroke-dasharray', '4,4')
      .style('stroke-width', 1);

    svg.append('text')
      .attr('x', width - 60)
      .attr('y', y(initialEquity) - 6)
      .style('fill', '#8892b0')
      .style('font-size', '11px')
      .text('初始资金');
  }

  formatTime(time: string): string {
    const date = new Date(time);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}

import { Component, ElementRef, Input, OnChanges, OnInit, OnDestroy, SimpleChanges, ViewChild, NgZone } from '@angular/core';
import * as d3 from 'd3';
import { AggregatedData } from '../models/aggregated-data.model';
import { Subject } from 'rxjs';
import { throttleTime, takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-candlestick-chart',
  template: `<div #chart class="chart-container"></div>`,
  styles: []
})
export class CandlestickChartComponent implements OnInit, OnChanges, OnDestroy {
  @ViewChild('chart') chartElement!: ElementRef;
  @Input() data: AggregatedData[] = [];
  @Input() symbol: string = '';

  private svg: any;
  private svgElement: any;
  private margin = { top: 20, right: 60, bottom: 40, left: 60 };
  private width = 0;
  private height = 0;
  private x: any;
  private y: any;
  private tooltip: any;
  private destroy$ = new Subject<void>();
  private updateTrigger$ = new Subject<void>();
  private activeTransitions: Set<any> = new Set();
  private isDestroyed = false;

  constructor(private ngZone: NgZone) {}

  ngOnInit(): void {
    this.initChart();
    this.setupThrottledUpdate();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] && this.data && this.data.length > 0) {
      this.updateTrigger$.next();
    }
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.destroy$.next();
    this.destroy$.complete();
    this.activeTransitions.forEach((t: any) => t.interrupt());
    this.activeTransitions.clear();
    this.cleanupDOM();
  }

  private cleanupDOM(): void {
    if (!this.chartElement?.nativeElement) return;
    
    const element = this.chartElement.nativeElement;
    
    d3.select(element).selectAll('*').interrupt();
    d3.select(element).selectAll('svg').remove();
    d3.select(element).selectAll('.candlestick-tooltip').remove();
    
    this.svg = null;
    this.svgElement = null;
    this.tooltip = null;
  }

  private setupThrottledUpdate(): void {
    this.updateTrigger$
      .pipe(
        throttleTime(500, undefined, { leading: true, trailing: true }),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        if (!this.isDestroyed) {
          this.ngZone.runOutsideAngular(() => {
            this.updateChart();
          });
        }
      });
  }

  private initChart(): void {
    const element = this.chartElement.nativeElement;
    
    d3.select(element).selectAll('*').remove();
    
    this.width = element.clientWidth - this.margin.left - this.margin.right;
    this.height = element.clientHeight - this.margin.top - this.margin.bottom;

    this.svgElement = d3.select(element)
      .append('svg')
      .attr('width', element.clientWidth)
      .attr('height', element.clientHeight);

    this.svg = this.svgElement
      .append('g')
      .attr('transform', `translate(${this.margin.left},${this.margin.top})`);

    this.tooltip = d3.select(element)
      .append('div')
      .attr('class', 'candlestick-tooltip')
      .style('opacity', 0);

    this.x = d3.scaleBand()
      .range([0, this.width])
      .padding(0.3);

    this.y = d3.scaleLinear()
      .range([this.height, 0]);

    this.svg.append('g')
      .attr('class', 'x axis')
      .attr('transform', `translate(0,${this.height})`);

    this.svg.append('g')
      .attr('class', 'y axis');

    this.svg.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${this.height})`);
  }

  private trackTransition(transition: any): any {
    this.activeTransitions.add(transition);
    transition.on('end', () => {
      this.activeTransitions.delete(transition);
    });
    return transition;
  }

  private updateChart(): void {
    if (!this.data || this.data.length === 0 || this.isDestroyed) return;

    const filteredData = this.symbol 
      ? this.data.filter(d => d.symbol === this.symbol).slice(-50)
      : this.data.slice(-50);

    if (filteredData.length === 0) return;

    const dateParser = d3.timeParse('%Y-%m-%dT%H:%M:%S');
    const formattedData = filteredData.map(d => ({
      ...d,
      date: dateParser(d.windowEnd.substring(0, 19)) || new Date()
    }));

    this.x.domain(formattedData.map((d: any) => d.date));
    const priceExtent = d3.extent(formattedData, (d: any) => [d.low, d.high]).flat();
    this.y.domain([priceExtent[0] * 0.998, priceExtent[1] * 1.002]);

    const xAxis = d3.axisBottom(this.x)
      .tickValues(this.x.domain().filter((_: any, i: number) => !(i % Math.ceil(formattedData.length / 10))))
      .tickFormat(d3.timeFormat('%H:%M'));

    const yAxis = d3.axisLeft(this.y)
      .tickFormat(d => d.toFixed(2));

    this.svg.select('.x.axis')
      .call(xAxis);

    this.svg.select('.y.axis')
      .call(yAxis);

    const grid = d3.axisLeft(this.y)
      .tickSize(-this.width)
      .tickFormat(() => '');

    this.svg.select('.grid')
      .call(grid);

    const candles = this.svg.selectAll('.candle')
      .data(formattedData, (d: any) => d.date.getTime());

    candles.exit().remove();

    const newCandles = candles.enter()
      .append('g')
      .attr('class', 'candle');

    newCandles.append('line')
      .attr('class', 'wick')
      .attr('x1', (d: any) => this.x(d.date) + this.x.bandwidth() / 2)
      .attr('x2', (d: any) => this.x(d.date) + this.x.bandwidth() / 2)
      .attr('y1', (d: any) => this.y(d.high))
      .attr('y2', (d: any) => this.y(d.low))
      .attr('stroke', (d: any) => d.close >= d.open ? '#00ff88' : '#ff6b6b')
      .attr('stroke-width', 1.5);

    const body = newCandles.append('rect')
      .attr('class', 'body')
      .attr('x', (d: any) => this.x(d.date))
      .attr('width', this.x.bandwidth())
      .attr('y', (d: any) => this.y(Math.max(d.open, d.close))))
      .attr('height', (d: any) => Math.max(1, Math.abs(this.y(d.open) - this.y(d.close)))))
      .attr('fill', (d: any) => d.close >= d.open ? '#00ff88' : '#ff6b6b')
      .attr('opacity', 0.8);

    this.setupTooltip(body);

    candles.select('.wick')
      .attr('x1', (d: any) => this.x(d.date) + this.x.bandwidth() / 2)
      .attr('x2', (d: any) => this.x(d.date) + this.x.bandwidth() / 2)
      .attr('y1', (d: any) => this.y(d.high))
      .attr('y2', (d: any) => this.y(d.low))
      .attr('stroke', (d: any) => d.close >= d.open ? '#00ff88' : '#ff6b6b');

    candles.select('.body')
      .attr('x', (d: any) => this.x(d.date))
      .attr('width', this.x.bandwidth())
      .attr('y', (d: any) => this.y(Math.max(d.open, d.close))))
      .attr('height', (d: any) => Math.max(1, Math.abs(this.y(d.open) - this.y(d.close))))
      .attr('fill', (d: any) => d.close >= d.open ? '#00ff88' : '#ff6b6b');
  }

  private setupTooltip(selection: any): void {
    const self = this;
    selection
      .on('mouseover', function(event: any, d: any) {
        if (self.isDestroyed) return;
        d3.select(this).attr('opacity', 1);
        self.tooltip
          .style('opacity', 1);
        self.tooltip.html(`
          <div class="tooltip-row"><span class="tooltip-label">时间:</span><span class="tooltip-value">${d3.timeFormat('%H:%M:%S')(d.date)}</span></div>
          <div class="tooltip-row"><span class="tooltip-label">开盘:</span><span class="tooltip-value">${d.open.toFixed(2)}</span></div>
          <div class="tooltip-row"><span class="tooltip-label">最高:</span><span class="tooltip-value">${d.high.toFixed(2)}</span></div>
          <div class="tooltip-row"><span class="tooltip-label">最低:</span><span class="tooltip-value">${d.low.toFixed(2)}</span></div>
          <div class="tooltip-row"><span class="tooltip-label">收盘:</span><span class="tooltip-value">${d.close.toFixed(2)}</span></div>
          <div class="tooltip-row"><span class="tooltip-label">成交量:</span><span class="tooltip-value">${d.volume.toLocaleString()}</span></div>
        `)
          .style('left', (event.pageX - 100) + 'px')
          .style('top', (event.pageY - 150) + 'px');
      })
      .on('mouseout', function() {
        if (self.isDestroyed) return;
        d3.select(this).attr('opacity', 0.8);
        self.tooltip
          .style('opacity', 0);
      });
  }
}

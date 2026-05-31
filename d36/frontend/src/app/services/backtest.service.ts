import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { StrategyConfig, BacktestResult } from '../models/backtest.model';

@Injectable({
  providedIn: 'root'
})
export class BacktestService {
  private apiUrl = 'http://localhost:8080/api/backtest';

  constructor(private http: HttpClient) {}

  runBacktest(config: StrategyConfig): Observable<BacktestResult> {
    return this.http.post<BacktestResult>(`${this.apiUrl}/run`, config);
  }

  getSymbols(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/symbols`);
  }

  getStrategies(): Observable<string[]> {
    return this.http.get<string[]>(`${this.apiUrl}/strategies`);
  }
}

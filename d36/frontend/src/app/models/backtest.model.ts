export type StrategyType = 'MA_CROSSOVER' | 'RSI' | 'BOLLINGER_BANDS' | 'MACD' | 'KDJ';

export interface StrategyConfig {
  type: StrategyType;
  symbol: string;
  startTime?: string;
  endTime?: string;
  initialCapital?: number;
  transactionFeeRate?: number;
  slippageRate?: number;
  maShortPeriod?: number;
  maLongPeriod?: number;
  rsiPeriod?: number;
  rsiOverbought?: number;
  rsiOversold?: number;
  bbPeriod?: number;
  bbStdDev?: number;
  macdFastPeriod?: number;
  macdSlowPeriod?: number;
  macdSignalPeriod?: number;
  kdjN?: number;
  kdjM1?: number;
  kdjM2?: number;
}

export interface Trade {
  time: string;
  symbol: string;
  type: string;
  price: number;
  quantity: number;
  amount: number;
  fee: number;
  slippage: number;
  netAmount: number;
}

export interface EquityPoint {
  time: string;
  equity: number;
  price: number;
}

export interface BacktestResult {
  symbol: string;
  strategyType: StrategyType;
  startTime: string;
  endTime: string;
  initialCapital: number;
  finalCapital: number;
  totalReturn: number;
  annualizedReturn: number;
  maxDrawdown: number;
  sharpeRatio: number;
  winRate: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  trades: Trade[];
  equityCurve: EquityPoint[];
  indicatorValues: { [key: string]: number[] };
}

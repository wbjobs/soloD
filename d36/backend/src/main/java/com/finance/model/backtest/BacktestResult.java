package com.finance.model.backtest;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BacktestResult {
    private String symbol;
    private StrategyType strategyType;
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private BigDecimal initialCapital;
    private BigDecimal finalCapital;
    private BigDecimal totalReturn;
    private BigDecimal annualizedReturn;
    private BigDecimal maxDrawdown;
    private BigDecimal sharpeRatio;
    private BigDecimal winRate;
    private int totalTrades;
    private int winningTrades;
    private int losingTrades;
    private BigDecimal avgWin;
    private BigDecimal avgLoss;
    private BigDecimal profitFactor;
    private List<Trade> trades;
    private List<EquityPoint> equityCurve;
    private Map<String, List<BigDecimal>> indicatorValues;
}

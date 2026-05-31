package com.finance.model.backtest;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class StrategyConfig {
    private StrategyType type;
    private String symbol;
    private LocalDateTime startTime;
    private LocalDateTime endTime;
    private BigDecimal initialCapital;
    private BigDecimal transactionFeeRate;
    private BigDecimal slippageRate;
    
    private Integer maShortPeriod;
    private Integer maLongPeriod;
    
    private Integer rsiPeriod;
    private BigDecimal rsiOverbought;
    private BigDecimal rsiOversold;
    
    private Integer bbPeriod;
    private BigDecimal bbStdDev;
    
    private Integer macdFastPeriod;
    private Integer macdSlowPeriod;
    private Integer macdSignalPeriod;
    
    private Integer kdjN;
    private Integer kdjM1;
    private Integer kdjM2;
}

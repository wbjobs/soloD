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
public class EquityPoint {
    private LocalDateTime time;
    private BigDecimal equity;
    private BigDecimal price;
}

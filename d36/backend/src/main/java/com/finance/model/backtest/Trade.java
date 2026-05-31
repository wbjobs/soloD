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
public class Trade {
    private LocalDateTime time;
    private String symbol;
    private String type;
    private BigDecimal price;
    private long quantity;
    private BigDecimal amount;
    private BigDecimal fee;
    private BigDecimal slippage;
    private BigDecimal netAmount;
}

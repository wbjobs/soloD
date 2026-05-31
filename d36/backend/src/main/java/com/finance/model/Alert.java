package com.finance.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Alert implements Serializable {
    private String symbol;
    private String message;
    private String type;
    private BigDecimal price;
    private BigDecimal changePercent;
    private LocalDateTime timestamp;
}

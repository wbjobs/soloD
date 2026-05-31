package com.finance.service;

import com.finance.model.TickData;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Random;

@Slf4j
@Service
@RequiredArgsConstructor
public class TickDataSimulator {

    private final KafkaProducerService kafkaProducerService;

    @Value("${simulation.stocks}")
    private String[] stocks;

    @Value("${simulation.tick-interval-ms}")
    private long tickIntervalMs;

    private final Map<String, BigDecimal> lastPrices = new HashMap<>();
    private final Random random = new Random();

    @PostConstruct
    public void init() {
        for (String stock : stocks) {
            lastPrices.put(stock, generateInitialPrice(stock));
        }
        log.info("Initialized stock prices: {}", lastPrices);
    }

    private BigDecimal generateInitialPrice(String symbol) {
        int hash = Math.abs(symbol.hashCode());
        return BigDecimal.valueOf(50 + (hash % 450)).setScale(2, RoundingMode.HALF_UP);
    }

    @Scheduled(fixedRateString = "${simulation.tick-interval-ms}")
    public void generateTickData() {
        for (String stock : stocks) {
            TickData tickData = generateSingleTick(stock);
            kafkaProducerService.sendTickData(tickData);
        }
    }

    private TickData generateSingleTick(String symbol) {
        BigDecimal lastPrice = lastPrices.get(symbol);
        
        double change = (random.nextDouble() - 0.5) * 0.02;
        BigDecimal newPrice = lastPrice.multiply(BigDecimal.valueOf(1 + change))
                .setScale(2, RoundingMode.HALF_UP);
        
        if (random.nextDouble() < 0.01) {
            double abnormalChange = (random.nextDouble() - 0.5) * 0.08;
            newPrice = lastPrice.multiply(BigDecimal.valueOf(1 + abnormalChange))
                    .setScale(2, RoundingMode.HALF_UP);
        }
        
        lastPrices.put(symbol, newPrice);
        
        long volume = 100 + random.nextInt(9900);
        
        return TickData.builder()
                .symbol(symbol)
                .price(newPrice)
                .volume(volume)
                .timestamp(LocalDateTime.now())
                .build();
    }
}

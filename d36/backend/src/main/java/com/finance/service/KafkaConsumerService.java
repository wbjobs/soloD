package com.finance.service;

import com.finance.model.AggregatedData;
import com.finance.model.Alert;
import com.finance.model.TickData;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;

@Slf4j
@Service
@RequiredArgsConstructor
public class KafkaConsumerService {

    private final WebSocketService webSocketService;
    private final Map<String, BigDecimal> lastPrices = new ConcurrentHashMap<>();
    
    private final Map<String, TickData> tickBuffer = new ConcurrentHashMap<>();
    private final ScheduledExecutorService flushExecutor = Executors.newSingleThreadScheduledExecutor();
    
    private final AtomicLong consumedTicks = new AtomicLong(0);
    private final AtomicLong lastLogTime = new AtomicLong(System.currentTimeMillis());
    
    private static final int MAX_BUFFER_SIZE = 1000;
    private static final long FLUSH_INTERVAL_MS = 100;
    private static final long LOG_INTERVAL_MS = 10000;

    public KafkaConsumerService(WebSocketService webSocketService) {
        this.webSocketService = webSocketService;
        startFlushScheduler();
    }

    private void startFlushScheduler() {
        flushExecutor.scheduleAtFixedRate(
                this::flushTickBuffer,
                FLUSH_INTERVAL_MS,
                FLUSH_INTERVAL_MS,
                TimeUnit.MILLISECONDS
        );
        
        Runtime.getRuntime().addShutdownHook(new Thread(flushExecutor::shutdown));
    }

    private void flushTickBuffer() {
        if (tickBuffer.isEmpty()) {
            return;
        }

        List<TickData> ticks = new ArrayList<>(tickBuffer.values());
        tickBuffer.clear();

        ticks.forEach(webSocketService::broadcastTickData);
        
        long total = consumedTicks.addAndGet(ticks.size());
        long now = System.currentTimeMillis();
        if (now - lastLogTime.get() > LOG_INTERVAL_MS) {
            log.info("Consumed {} tick messages total", total);
            lastLogTime.set(now);
        }
    }

    @KafkaListener(
            topics = "${kafka.topics.tick-data}",
            groupId = "backend-group",
            batch = "true",
            concurrency = "2"
    )
    public void consumeTickData(List<TickData> tickDataList, Acknowledgment ack) {
        try {
            for (TickData tickData : tickDataList) {
                if (tickData == null || tickData.getSymbol() == null) {
                    continue;
                }

                checkForAbnormalMovement(tickData);
                lastPrices.put(tickData.getSymbol(), tickData.getPrice());
                
                tickBuffer.put(tickData.getSymbol(), tickData);
                
                if (tickBuffer.size() >= MAX_BUFFER_SIZE) {
                    flushTickBuffer();
                }
            }
            ack.acknowledge();
        } catch (Exception e) {
            log.error("Error consuming tick data batch", e);
            ack.acknowledge();
        }
    }

    @KafkaListener(
            topics = "${kafka.topics.aggregated-data}",
            groupId = "backend-group",
            batch = "true"
    )
    public void consumeAggregatedData(List<AggregatedData> aggregatedDataList, Acknowledgment ack) {
        try {
            for (AggregatedData aggregatedData : aggregatedDataList) {
                if (aggregatedData == null) {
                    continue;
                }
                
                log.debug("Received aggregated data for {}: VWAP={}", 
                        aggregatedData.getSymbol(), aggregatedData.getVwap());
                webSocketService.broadcastAggregatedData(aggregatedData);
            }
            ack.acknowledge();
        } catch (Exception e) {
            log.error("Error consuming aggregated data", e);
            ack.acknowledge();
        }
    }

    @KafkaListener(
            topics = "${kafka.topics.alerts}",
            groupId = "backend-group"
    )
    public void consumeAlerts(Alert alert, Acknowledgment ack) {
        try {
            if (alert == null) {
                ack.acknowledge();
                return;
            }
            
            log.warn("Received alert: {} - {}", alert.getSymbol(), alert.getMessage());
            webSocketService.broadcastAlert(alert);
            ack.acknowledge();
        } catch (Exception e) {
            log.error("Error consuming alert", e);
            ack.acknowledge();
        }
    }

    private void checkForAbnormalMovement(TickData tickData) {
        BigDecimal lastPrice = lastPrices.get(tickData.getSymbol());
        if (lastPrice != null) {
            try {
                BigDecimal changePercent = tickData.getPrice()
                        .subtract(lastPrice)
                        .divide(lastPrice, 4, java.math.RoundingMode.HALF_UP)
                        .multiply(BigDecimal.valueOf(100));
                
                if (changePercent.abs().compareTo(BigDecimal.valueOf(3)) > 0) {
                    Alert alert = Alert.builder()
                            .symbol(tickData.getSymbol())
                            .message("异常价格波动: " + changePercent.setScale(2) + "%")
                            .type("PRICE_ALERT")
                            .price(tickData.getPrice())
                            .changePercent(changePercent)
                            .timestamp(LocalDateTime.now())
                            .build();
                    webSocketService.broadcastAlert(alert);
                }
            } catch (ArithmeticException e) {
                log.warn("Error calculating price change percent: {}", e.getMessage());
            }
        }
    }
}

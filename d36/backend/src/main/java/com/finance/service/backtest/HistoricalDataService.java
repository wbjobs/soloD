package com.finance.service.backtest;

import com.finance.model.backtest.CandleData;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
public class HistoricalDataService {

    private final Map<String, List<CandleData>> historicalDataCache = new ConcurrentHashMap<>();
    private final Random random = new Random(42);

    public List<CandleData> generateHistoricalData(String symbol, LocalDateTime startTime, LocalDateTime endTime, int intervalMinutes) {
        String cacheKey = symbol + "_" + startTime + "_" + endTime + "_" + intervalMinutes;
        
        if (historicalDataCache.containsKey(cacheKey)) {
            log.debug("Returning cached historical data for {}", symbol);
            return historicalDataCache.get(cacheKey);
        }

        List<CandleData> candles = new ArrayList<>();
        BigDecimal basePrice = getBasePrice(symbol);
        BigDecimal currentPrice = basePrice;
        LocalDateTime currentTime = startTime;

        while (currentTime.isBefore(endTime)) {
            BigDecimal volatility = BigDecimal.valueOf(0.005 + random.nextDouble() * 0.02);
            BigDecimal changePercent = BigDecimal.valueOf((random.nextGaussian() * 0.01));
            BigDecimal trend = BigDecimal.valueOf(Math.sin(currentTime.getDayOfMonth() * 0.3) * 0.001);
            
            BigDecimal open = currentPrice;
            BigDecimal close = open.multiply(BigDecimal.ONE.add(changePercent).add(trend));
            BigDecimal highLowRange = open.multiply(volatility);
            
            BigDecimal high = open.max(close).add(highLowRange.multiply(BigDecimal.valueOf(random.nextDouble())));
            BigDecimal low = open.min(close).subtract(highLowRange.multiply(BigDecimal.valueOf(random.nextDouble())));
            
            long volume = 1000000 + random.nextInt(5000000);
            BigDecimal amount = close.multiply(BigDecimal.valueOf(volume));

            CandleData candle = CandleData.builder()
                    .time(currentTime)
                    .symbol(symbol)
                    .open(open.setScale(2, RoundingMode.HALF_UP))
                    .high(high.setScale(2, RoundingMode.HALF_UP))
                    .low(low.setScale(2, RoundingMode.HALF_UP))
                    .close(close.setScale(2, RoundingMode.HALF_UP))
                    .volume(volume)
                    .amount(amount.setScale(2, RoundingMode.HALF_UP))
                    .build();

            candles.add(candle);
            currentPrice = close;
            currentTime = currentTime.plusMinutes(intervalMinutes);
        }

        historicalDataCache.put(cacheKey, candles);
        log.info("Generated {} historical candles for {}", candles.size(), symbol);
        
        return candles;
    }

    private BigDecimal getBasePrice(String symbol) {
        Map<String, Double> basePrices = Map.of(
                "AAPL", 175.0,
                "GOOGL", 140.0,
                "MSFT", 380.0,
                "AMZN", 180.0,
                "BABA", 85.0
        );
        return BigDecimal.valueOf(basePrices.getOrDefault(symbol, 100.0));
    }

    public List<String> getAvailableSymbols() {
        return Arrays.asList("AAPL", "GOOGL", "MSFT", "AMZN", "BABA");
    }

    public void clearCache() {
        historicalDataCache.clear();
        log.info("Historical data cache cleared");
    }
}

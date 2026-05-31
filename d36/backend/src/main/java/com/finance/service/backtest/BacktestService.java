package com.finance.service.backtest;

import com.finance.model.backtest.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class BacktestService {

    private final HistoricalDataService historicalDataService;
    private final StrategyEngine strategyEngine;

    public BacktestResult runBacktest(StrategyConfig config) {
        String symbol = config.getSymbol() != null ? config.getSymbol() : "AAPL";
        LocalDateTime startTime = config.getStartTime() != null ? config.getStartTime() : LocalDateTime.now().minusDays(30);
        LocalDateTime endTime = config.getEndTime() != null ? config.getEndTime() : LocalDateTime.now();
        BigDecimal initialCapital = config.getInitialCapital() != null ? config.getInitialCapital() : BigDecimal.valueOf(100000);
        BigDecimal transactionFeeRate = config.getTransactionFeeRate() != null ? config.getTransactionFeeRate() : BigDecimal.valueOf(0.001);
        BigDecimal slippageRate = config.getSlippageRate() != null ? config.getSlippageRate() : BigDecimal.valueOf(0.001);

        List<CandleData> candles = historicalDataService.generateHistoricalData(symbol, startTime, endTime, 60);
        
        List<TradeSignal> signals = strategyEngine.generateSignals(candles, config);

        List<Trade> trades = new ArrayList<>();
        List<EquityPoint> equityCurve = new ArrayList<>();
        BigDecimal cash = initialCapital;
        long position = 0;
        BigDecimal entryPrice = BigDecimal.ZERO;
        BigDecimal peakEquity = initialCapital;
        BigDecimal maxDrawdown = BigDecimal.ZERO;

        List<BigDecimal> returns = new ArrayList<>();
        List<BigDecimal> winTrades = new ArrayList<>();
        List<BigDecimal> lossTrades = new ArrayList<>();
        BigDecimal previousEquity = initialCapital;

        for (int i = 0; i < candles.size(); i++) {
            CandleData candle = candles.get(i);
            TradeSignal signal = signals.get(i);
            BigDecimal currentPrice = candle.getClose();

            BigDecimal positionValue = position > 0 ? currentPrice.multiply(BigDecimal.valueOf(position)) : BigDecimal.ZERO;
            BigDecimal currentEquity = cash.add(positionValue);

            equityCurve.add(EquityPoint.builder()
                    .time(candle.getTime())
                    .equity(currentEquity.setScale(2, RoundingMode.HALF_UP))
                    .price(currentPrice)
                    .build());

            previousEquity = currentEquity;

            if (currentEquity.compareTo(peakEquity) > 0) {
                peakEquity = currentEquity;
            }

            BigDecimal drawdown = peakEquity.subtract(currentEquity).divide(peakEquity, 4, RoundingMode.HALF_UP).multiply(BigDecimal.valueOf(100));
            if (drawdown.compareTo(maxDrawdown) > 0) {
                maxDrawdown = drawdown;
            }

            if (signal == TradeSignal.BUY && position == 0) {
                BigDecimal buyPrice = currentPrice.multiply(BigDecimal.ONE.add(slippageRate));
                long maxShares = cash.divide(buyPrice, 0, RoundingMode.DOWN).longValue();
                if (maxShares > 0) {
                    BigDecimal amount = buyPrice.multiply(BigDecimal.valueOf(maxShares));
                    BigDecimal fee = amount.multiply(transactionFeeRate);
                    BigDecimal netAmount = amount.add(fee);
                    
                    if (netAmount.compareTo(cash) <= 0) {
                        cash = cash.subtract(netAmount);
                        position = maxShares;
                        entryPrice = buyPrice;

                        trades.add(Trade.builder()
                                .time(candle.getTime())
                                .symbol(symbol)
                                .type("BUY")
                                .price(buyPrice.setScale(2, RoundingMode.HALF_UP))
                                .quantity(maxShares)
                                .amount(amount.setScale(2, RoundingMode.HALF_UP))
                                .fee(fee.setScale(2, RoundingMode.HALF_UP))
                                .slippage(amount.multiply(slippageRate).setScale(2, RoundingMode.HALF_UP))
                                .netAmount(netAmount.setScale(2, RoundingMode.HALF_UP))
                                .build());
                    }
                }
            } else if (signal == TradeSignal.SELL && position > 0) {
                BigDecimal sellPrice = currentPrice.multiply(BigDecimal.ONE.subtract(slippageRate));
                BigDecimal amount = sellPrice.multiply(BigDecimal.valueOf(position));
                BigDecimal fee = amount.multiply(transactionFeeRate);
                BigDecimal netAmount = amount.subtract(fee);
                
                BigDecimal profit = amount.subtract(entryPrice.multiply(BigDecimal.valueOf(position)));
                BigDecimal profitPercent = profit.divide(entryPrice.multiply(BigDecimal.valueOf(position)), 4, RoundingMode.HALF_UP).multiply(BigDecimal.valueOf(100));

                cash = cash.add(netAmount);
                
                trades.add(Trade.builder()
                        .time(candle.getTime())
                        .symbol(symbol)
                        .type("SELL")
                        .price(sellPrice.setScale(2, RoundingMode.HALF_UP))
                        .quantity(position)
                        .amount(amount.setScale(2, RoundingMode.HALF_UP))
                        .fee(fee.setScale(2, RoundingMode.HALF_UP))
                        .slippage(amount.multiply(slippageRate).setScale(2, RoundingMode.HALF_UP))
                        .netAmount(netAmount.setScale(2, RoundingMode.HALF_UP))
                        .build());

                if (profitPercent.compareTo(BigDecimal.ZERO) > 0) {
                    winTrades.add(profitPercent);
                } else {
                    lossTrades.add(profitPercent.abs());
                }

                position = 0;
                entryPrice = BigDecimal.ZERO;
            }

            if (i > 0) {
                BigDecimal prevEquity = equityCurve.get(i - 1).getEquity();
                if (prevEquity.compareTo(BigDecimal.ZERO) > 0) {
                    BigDecimal dailyReturn = currentEquity.subtract(prevEquity).divide(prevEquity, 6, RoundingMode.HALF_UP);
                    returns.add(dailyReturn);
                }
            }
        }

        if (position > 0) {
            CandleData lastCandle = candles.get(candles.size() - 1);
            BigDecimal sellPrice = lastCandle.getClose();
            BigDecimal amount = sellPrice.multiply(BigDecimal.valueOf(position));
            cash = cash.add(amount);
            position = 0;
        }

        BigDecimal finalCapital = cash;
        BigDecimal totalReturn = finalCapital.subtract(initialCapital)
                .divide(initialCapital, 4, RoundingMode.HALF_UP).multiply(BigDecimal.valueOf(100));

        long days = ChronoUnit.DAYS.between(startTime, endTime);
        BigDecimal annualizedReturn = days > 0 ?
                totalReturn.multiply(BigDecimal.valueOf(365.0 / days)).setScale(2, RoundingMode.HALF_UP) :
                totalReturn;

        BigDecimal sharpeRatio = calculateSharpeRatio(returns);
        BigDecimal winRate = trades.isEmpty() ? BigDecimal.ZERO :
                BigDecimal.valueOf(winTrades.size()).multiply(BigDecimal.valueOf(100))
                        .divide(BigDecimal.valueOf((winTrades.size() + lossTrades.size()) / 2), 2, RoundingMode.HALF_UP);

        BigDecimal avgWin = winTrades.isEmpty() ? BigDecimal.ZERO :
                winTrades.stream().reduce(BigDecimal.ZERO, BigDecimal::add)
                        .divide(BigDecimal.valueOf(winTrades.size()), 2, RoundingMode.HALF_UP);

        BigDecimal avgLoss = lossTrades.isEmpty() ? BigDecimal.ZERO :
                lossTrades.stream().reduce(BigDecimal.ZERO, BigDecimal::add)
                        .divide(BigDecimal.valueOf(lossTrades.size()), 2, RoundingMode.HALF_UP);

        BigDecimal profitFactor;
        if (lossTrades.isEmpty()) {
            profitFactor = winTrades.isEmpty() ? BigDecimal.ZERO : BigDecimal.valueOf(999);
        } else {
            BigDecimal totalWin = winTrades.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
            BigDecimal totalLoss = lossTrades.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
            profitFactor = totalLoss.compareTo(BigDecimal.ZERO) == 0 ? BigDecimal.valueOf(999) :
                    totalWin.divide(totalLoss, 2, RoundingMode.HALF_UP);
        }

        Map<String, List<BigDecimal>> indicators = new HashMap<>();
        indicators.put("MA5", calculateMA(candles, 5));
        indicators.put("MA20", calculateMA(candles, 20));
        indicators.put("RSI", calculateRSI(candles, 14));

        log.info("Backtest completed: symbol={}, totalReturn={}%, trades={}, maxDrawdown={}%",
                symbol, totalReturn, trades.size(), maxDrawdown);

        return BacktestResult.builder()
                .symbol(symbol)
                .strategyType(config.getType())
                .startTime(startTime)
                .endTime(endTime)
                .initialCapital(initialCapital)
                .finalCapital(finalCapital.setScale(2, RoundingMode.HALF_UP))
                .totalReturn(totalReturn)
                .annualizedReturn(annualizedReturn)
                .maxDrawdown(maxDrawdown)
                .sharpeRatio(sharpeRatio)
                .winRate(winRate)
                .totalTrades(trades.size())
                .winningTrades(winTrades.size())
                .losingTrades(lossTrades.size())
                .avgWin(avgWin)
                .avgLoss(avgLoss)
                .profitFactor(profitFactor)
                .trades(trades)
                .equityCurve(equityCurve)
                .indicatorValues(indicators)
                .build();
    }

    private BigDecimal calculateSharpeRatio(List<BigDecimal> returns) {
        if (returns.isEmpty()) return BigDecimal.ZERO;

        BigDecimal sum = BigDecimal.ZERO;
        for (BigDecimal r : returns) {
            sum = sum.add(r);
        }
        BigDecimal mean = sum.divide(BigDecimal.valueOf(returns.size()), 6, RoundingMode.HALF_UP);

        BigDecimal variance = BigDecimal.ZERO;
        for (BigDecimal r : returns) {
            BigDecimal diff = r.subtract(mean);
            variance = variance.add(diff.multiply(diff));
        }
        variance = variance.divide(BigDecimal.valueOf(returns.size()), 6, RoundingMode.HALF_UP);
        BigDecimal std = BigDecimal.valueOf(Math.sqrt(variance.doubleValue()));

        BigDecimal riskFreeRate = BigDecimal.valueOf(0.02 / 252);
        BigDecimal excessReturn = mean.subtract(riskFreeRate);

        if (std.compareTo(BigDecimal.ZERO) == 0) {
            return BigDecimal.ZERO;
        }

        BigDecimal sharpe = excessReturn.divide(std, 2, RoundingMode.HALF_UP);
        return sharpe.multiply(BigDecimal.valueOf(Math.sqrt(252))).setScale(2, RoundingMode.HALF_UP);
    }

    private List<BigDecimal> calculateMA(List<CandleData> candles, int period) {
        List<BigDecimal> ma = new ArrayList<>();
        for (int i = 0; i < candles.size(); i++) {
            if (i < period - 1) {
                ma.add(null);
            } else {
                BigDecimal sum = BigDecimal.ZERO;
                for (int j = i - period + 1; j <= i; j++) {
                    sum = sum.add(candles.get(j).getClose());
                }
                ma.add(sum.divide(BigDecimal.valueOf(period), 2, RoundingMode.HALF_UP));
            }
        }
        return ma;
    }

    private List<BigDecimal> calculateRSI(List<CandleData> candles, int period) {
        List<BigDecimal> rsi = new ArrayList<>();
        List<BigDecimal> gains = new ArrayList<>();
        List<BigDecimal> losses = new ArrayList<>();

        for (int i = 0; i < candles.size(); i++) {
            if (i == 0) {
                gains.add(BigDecimal.ZERO);
                losses.add(BigDecimal.ZERO);
            } else {
                BigDecimal change = candles.get(i).getClose().subtract(candles.get(i - 1).getClose());
                if (change.compareTo(BigDecimal.ZERO) > 0) {
                    gains.add(change);
                    losses.add(BigDecimal.ZERO);
                } else {
                    gains.add(BigDecimal.ZERO);
                    losses.add(change.abs());
                }
            }
        }

        for (int i = 0; i < candles.size(); i++) {
            if (i < period) {
                rsi.add(null);
            } else {
                BigDecimal avgGain = average(gains.subList(i - period + 1, i + 1));
                BigDecimal avgLoss = average(losses.subList(i - period + 1, i + 1));

                if (avgLoss.compareTo(BigDecimal.ZERO) == 0) {
                    rsi.add(BigDecimal.valueOf(100));
                } else {
                    BigDecimal rs = avgGain.divide(avgLoss, 4, RoundingMode.HALF_UP);
                    BigDecimal rsiValue = BigDecimal.valueOf(100).subtract(
                            BigDecimal.valueOf(100).divide(BigDecimal.ONE.add(rs), 2, RoundingMode.HALF_UP));
                    rsi.add(rsiValue);
                }
            }
        }
        return rsi;
    }

    private BigDecimal average(List<BigDecimal> values) {
        if (values.isEmpty()) return BigDecimal.ZERO;
        BigDecimal sum = BigDecimal.ZERO;
        for (BigDecimal value : values) {
            sum = sum.add(value);
        }
        return sum.divide(BigDecimal.valueOf(values.size()), 4, RoundingMode.HALF_UP);
    }
}

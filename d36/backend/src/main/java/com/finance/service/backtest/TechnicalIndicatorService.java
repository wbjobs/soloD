package com.finance.service.backtest;

import com.finance.model.backtest.CandleData;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
public class TechnicalIndicatorService {

    public List<BigDecimal> calculateMA(List<CandleData> candles, int period) {
        List<BigDecimal> ma = new ArrayList<>();
        for (int i = 0; i < candles.size(); i++) {
            if (i < period - 1) {
                ma.add(null);
            } else {
                BigDecimal sum = BigDecimal.ZERO;
                for (int j = i - period + 1; j <= i; j++) {
                    sum = sum.add(candles.get(j).getClose());
                }
                ma.add(sum.divide(BigDecimal.valueOf(period), 4, RoundingMode.HALF_UP));
            }
        }
        return ma;
    }

    public List<BigDecimal> calculateEMA(List<CandleData> candles, int period) {
        List<BigDecimal> ema = new ArrayList<>();
        BigDecimal multiplier = BigDecimal.valueOf(2.0 / (period + 1));
        
        BigDecimal previousEma = null;
        for (int i = 0; i < candles.size(); i++) {
            if (i < period - 1) {
                ema.add(null);
            } else if (i == period - 1) {
                BigDecimal sum = BigDecimal.ZERO;
                for (int j = 0; j < period; j++) {
                    sum = sum.add(candles.get(j).getClose());
                }
                previousEma = sum.divide(BigDecimal.valueOf(period), 4, RoundingMode.HALF_UP);
                ema.add(previousEma);
            } else {
                BigDecimal currentPrice = candles.get(i).getClose();
                BigDecimal currentEma = currentPrice.multiply(multiplier)
                        .add(previousEma.multiply(BigDecimal.ONE.subtract(multiplier)));
                ema.add(currentEma);
                previousEma = currentEma;
            }
        }
        return ema;
    }

    public List<BigDecimal> calculateRSI(List<CandleData> candles, int period) {
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
            } else if (i == period) {
                BigDecimal avgGain = average(gains.subList(1, period + 1));
                BigDecimal avgLoss = average(losses.subList(1, period + 1));
                
                if (avgLoss.compareTo(BigDecimal.ZERO) == 0) {
                    rsi.add(BigDecimal.valueOf(100));
                } else {
                    BigDecimal rs = avgGain.divide(avgLoss, 4, RoundingMode.HALF_UP);
                    BigDecimal rsiValue = BigDecimal.valueOf(100).subtract(
                            BigDecimal.valueOf(100).divide(BigDecimal.ONE.add(rs), 2, RoundingMode.HALF_UP));
                    rsi.add(rsiValue);
                }
            } else {
                BigDecimal prevAvgGain = average(gains.subList(i - period, i));
                BigDecimal prevAvgLoss = average(losses.subList(i - period, i));
                
                BigDecimal avgGain = prevAvgGain.multiply(BigDecimal.valueOf(period - 1))
                        .add(gains.get(i))
                        .divide(BigDecimal.valueOf(period), 4, RoundingMode.HALF_UP);
                BigDecimal avgLoss = prevAvgLoss.multiply(BigDecimal.valueOf(period - 1))
                        .add(losses.get(i))
                        .divide(BigDecimal.valueOf(period), 4, RoundingMode.HALF_UP);

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

    public List<BollingerBand> calculateBollingerBands(List<CandleData> candles, int period, BigDecimal stdDevMultiplier) {
        List<BollingerBand> bands = new ArrayList<>();
        List<BigDecimal> sma = calculateMA(candles, period);

        for (int i = 0; i < candles.size(); i++) {
            if (i < period - 1) {
                bands.add(null);
            } else {
                BigDecimal sumSquaredDiff = BigDecimal.ZERO;
                for (int j = i - period + 1; j <= i; j++) {
                    BigDecimal diff = candles.get(j).getClose().subtract(sma.get(i));
                    sumSquaredDiff = sumSquaredDiff.add(diff.multiply(diff));
                }
                BigDecimal variance = sumSquaredDiff.divide(BigDecimal.valueOf(period), 4, RoundingMode.HALF_UP);
                BigDecimal stdDev = BigDecimal.valueOf(Math.sqrt(variance.doubleValue()));

                BigDecimal upper = sma.get(i).add(stdDev.multiply(stdDevMultiplier));
                BigDecimal lower = sma.get(i).subtract(stdDev.multiply(stdDevMultiplier));

                bands.add(new BollingerBand(upper, sma.get(i), lower));
            }
        }
        return bands;
    }

    public List<MACD> calculateMACD(List<CandleData> candles, int fastPeriod, int slowPeriod, int signalPeriod) {
        List<BigDecimal> emaFast = calculateEMA(candles, fastPeriod);
        List<BigDecimal> emaSlow = calculateEMA(candles, slowPeriod);
        
        List<BigDecimal> macdLine = new ArrayList<>();
        for (int i = 0; i < candles.size(); i++) {
            if (emaSlow.get(i) == null) {
                macdLine.add(null);
            } else {
                macdLine.add(emaFast.get(i).subtract(emaSlow.get(i)));
            }
        }

        List<CandleData> macdCandles = new ArrayList<>();
        for (int i = 0; i < candles.size(); i++) {
            if (macdLine.get(i) != null) {
                macdCandles.add(CandleData.builder().close(macdLine.get(i)).build());
            } else {
                macdCandles.add(CandleData.builder().close(BigDecimal.ZERO).build());
            }
        }

        List<BigDecimal> signalLine = calculateEMA(macdCandles, signalPeriod);
        List<MACD> macdList = new ArrayList<>();

        for (int i = 0; i < candles.size(); i++) {
            if (macdLine.get(i) == null || signalLine.get(i) == null) {
                macdList.add(null);
            } else {
                BigDecimal histogram = macdLine.get(i).subtract(signalLine.get(i));
                macdList.add(new MACD(macdLine.get(i), signalLine.get(i), histogram));
            }
        }
        return macdList;
    }

    private BigDecimal average(List<BigDecimal> values) {
        if (values.isEmpty()) return BigDecimal.ZERO;
        BigDecimal sum = BigDecimal.ZERO;
        for (BigDecimal value : values) {
            sum = sum.add(value);
        }
        return sum.divide(BigDecimal.valueOf(values.size()), 4, RoundingMode.HALF_UP);
    }

    public static class BollingerBand {
        public BigDecimal upper;
        public BigDecimal middle;
        public BigDecimal lower;

        public BollingerBand(BigDecimal upper, BigDecimal middle, BigDecimal lower) {
            this.upper = upper;
            this.middle = middle;
            this.lower = lower;
        }
    }

    public static class MACD {
        public BigDecimal macd;
        public BigDecimal signal;
        public BigDecimal histogram;

        public MACD(BigDecimal macd, BigDecimal signal, BigDecimal histogram) {
            this.macd = macd;
            this.signal = signal;
            this.histogram = histogram;
        }
    }
}

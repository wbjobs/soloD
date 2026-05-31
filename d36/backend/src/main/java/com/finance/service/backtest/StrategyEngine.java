package com.finance.service.backtest;

import com.finance.model.backtest.*;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class StrategyEngine {

    private final TechnicalIndicatorService indicatorService;

    public List<TradeSignal> generateSignals(List<CandleData> candles, StrategyConfig config) {
        return switch (config.getType()) {
            case MA_CROSSOVER -> generateMACrossoverSignals(candles, config);
            case RSI -> generateRSISignals(candles, config);
            case BOLLINGER_BANDS -> generateBollingerSignals(candles, config);
            case MACD -> generateMACDSignals(candles, config);
            case KDJ -> generateKDJSignals(candles, config);
        };
    }

    private List<TradeSignal> generateMACrossoverSignals(List<CandleData> candles, StrategyConfig config) {
        int shortPeriod = config.getMaShortPeriod() != null ? config.getMaShortPeriod() : 5;
        int longPeriod = config.getMaLongPeriod() != null ? config.getMaLongPeriod() : 20;

        List<BigDecimal> maShort = indicatorService.calculateMA(candles, shortPeriod);
        List<BigDecimal> maLong = indicatorService.calculateMA(candles, longPeriod);

        List<TradeSignal> signals = new ArrayList<>();
        for (int i = 0; i < candles.size(); i++) {
            if (i < longPeriod) {
                signals.add(TradeSignal.HOLD);
                continue;
            }

            BigDecimal prevShort = maShort.get(i - 1);
            BigDecimal prevLong = maLong.get(i - 1);
            BigDecimal currShort = maShort.get(i);
            BigDecimal currLong = maLong.get(i);

            if (prevShort != null && prevLong != null && currShort != null && currLong != null) {
                if (prevShort.compareTo(prevLong) <= 0 && currShort.compareTo(currLong) > 0) {
                    signals.add(TradeSignal.BUY);
                } else if (prevShort.compareTo(prevLong) >= 0 && currShort.compareTo(currLong) < 0) {
                    signals.add(TradeSignal.SELL);
                } else {
                    signals.add(TradeSignal.HOLD);
                }
            } else {
                signals.add(TradeSignal.HOLD);
            }
        }
        return signals;
    }

    private List<TradeSignal> generateRSISignals(List<CandleData> candles, StrategyConfig config) {
        int period = config.getRsiPeriod() != null ? config.getRsiPeriod() : 14;
        BigDecimal overbought = config.getRsiOverbought() != null ? config.getRsiOverbought() : BigDecimal.valueOf(70);
        BigDecimal oversold = config.getRsiOversold() != null ? config.getRsiOversold() : BigDecimal.valueOf(30);

        List<BigDecimal> rsi = indicatorService.calculateRSI(candles, period);

        List<TradeSignal> signals = new ArrayList<>();
        for (int i = 0; i < candles.size(); i++) {
            if (i < period || rsi.get(i) == null) {
                signals.add(TradeSignal.HOLD);
                continue;
            }

            BigDecimal rsiValue = rsi.get(i);
            BigDecimal prevRsi = rsi.get(i - 1);

            if (prevRsi != null) {
                if (prevRsi.compareTo(oversold) <= 0 && rsiValue.compareTo(oversold) > 0) {
                    signals.add(TradeSignal.BUY);
                } else if (prevRsi.compareTo(overbought) >= 0 && rsiValue.compareTo(overbought) < 0) {
                    signals.add(TradeSignal.SELL);
                } else {
                    signals.add(TradeSignal.HOLD);
                }
            } else {
                signals.add(TradeSignal.HOLD);
            }
        }
        return signals;
    }

    private List<TradeSignal> generateBollingerSignals(List<CandleData> candles, StrategyConfig config) {
        int period = config.getBbPeriod() != null ? config.getBbPeriod() : 20;
        BigDecimal stdDev = config.getBbStdDev() != null ? config.getBbStdDev() : BigDecimal.valueOf(2);

        List<TechnicalIndicatorService.BollingerBand> bands = indicatorService.calculateBollingerBands(candles, period, stdDev);

        List<TradeSignal> signals = new ArrayList<>();
        for (int i = 0; i < candles.size(); i++) {
            if (i < period || bands.get(i) == null) {
                signals.add(TradeSignal.HOLD);
                continue;
            }

            BigDecimal price = candles.get(i).getClose();
            TechnicalIndicatorService.BollingerBand band = bands.get(i);

            if (price.compareTo(band.lower) < 0) {
                signals.add(TradeSignal.BUY);
            } else if (price.compareTo(band.upper) > 0) {
                signals.add(TradeSignal.SELL);
            } else {
                signals.add(TradeSignal.HOLD);
            }
        }
        return signals;
    }

    private List<TradeSignal> generateMACDSignals(List<CandleData> candles, StrategyConfig config) {
        int fastPeriod = config.getMacdFastPeriod() != null ? config.getMacdFastPeriod() : 12;
        int slowPeriod = config.getMacdSlowPeriod() != null ? config.getMacdSlowPeriod() : 26;
        int signalPeriod = config.getMacdSignalPeriod() != null ? config.getMacdSignalPeriod() : 9;

        List<TechnicalIndicatorService.MACD> macdList = indicatorService.calculateMACD(candles, fastPeriod, slowPeriod, signalPeriod);

        List<TradeSignal> signals = new ArrayList<>();
        for (int i = 0; i < candles.size(); i++) {
            if (i < slowPeriod + signalPeriod || macdList.get(i) == null || macdList.get(i - 1) == null) {
                signals.add(TradeSignal.HOLD);
                continue;
            }

            TechnicalIndicatorService.MACD currMacd = macdList.get(i);
            TechnicalIndicatorService.MACD prevMacd = macdList.get(i - 1);

            if (prevMacd.macd.compareTo(prevMacd.signal) <= 0 && currMacd.macd.compareTo(currMacd.signal) > 0) {
                signals.add(TradeSignal.BUY);
            } else if (prevMacd.macd.compareTo(prevMacd.signal) >= 0 && currMacd.macd.compareTo(currMacd.signal) < 0) {
                signals.add(TradeSignal.SELL);
            } else {
                signals.add(TradeSignal.HOLD);
            }
        }
        return signals;
    }

    private List<TradeSignal> generateKDJSignals(List<CandleData> candles, StrategyConfig config) {
        int n = config.getKdjN() != null ? config.getKdjN() : 9;
        int m1 = config.getKdjM1() != null ? config.getKdjM1() : 3;
        int m2 = config.getKdjM2() != null ? config.getKdjM2() : 3;

        List<BigDecimal> rsv = new ArrayList<>();
        for (int i = 0; i < candles.size(); i++) {
            if (i < n - 1) {
                rsv.add(null);
                continue;
            }

            BigDecimal lowestLow = BigDecimal.valueOf(Double.MAX_VALUE);
            BigDecimal highestHigh = BigDecimal.ZERO;
            for (int j = i - n + 1; j <= i; j++) {
                if (candles.get(j).getLow().compareTo(lowestLow) < 0) {
                    lowestLow = candles.get(j).getLow();
                }
                if (candles.get(j).getHigh().compareTo(highestHigh) > 0) {
                    highestHigh = candles.get(j).getHigh();
                }
            }

            BigDecimal close = candles.get(i).getClose();
            if (highestHigh.compareTo(lowestLow) == 0) {
                rsv.add(BigDecimal.valueOf(50));
            } else {
                BigDecimal rsvValue = close.subtract(lowestLow)
                        .divide(highestHigh.subtract(lowestLow), 4, RoundingMode.HALF_UP)
                        .multiply(BigDecimal.valueOf(100));
                rsv.add(rsvValue);
            }
        }

        List<BigDecimal> kList = sma(rsv, m1);
        List<BigDecimal> dList = sma(kList, m2);

        List<TradeSignal> signals = new ArrayList<>();
        for (int i = 0; i < candles.size(); i++) {
            if (i < n + m1 + m2 || kList.get(i) == null || dList.get(i) == null) {
                signals.add(TradeSignal.HOLD);
                continue;
            }

            BigDecimal k = kList.get(i);
            BigDecimal d = dList.get(i);
            BigDecimal prevK = kList.get(i - 1);
            BigDecimal prevD = dList.get(i - 1);

            if (prevK != null && prevD != null) {
                if (prevK.compareTo(prevD) <= 0 && k.compareTo(d) > 0) {
                    signals.add(TradeSignal.BUY);
                } else if (prevK.compareTo(prevD) >= 0 && k.compareTo(d) < 0) {
                    signals.add(TradeSignal.SELL);
                } else {
                    signals.add(TradeSignal.HOLD);
                }
            } else {
                signals.add(TradeSignal.HOLD);
            }
        }
        return signals;
    }

    private List<BigDecimal> sma(List<BigDecimal> values, int period) {
        List<BigDecimal> result = new ArrayList<>();
        for (int i = 0; i < values.size(); i++) {
            if (values.get(i) == null) {
                result.add(null);
                continue;
            }

            BigDecimal sum = BigDecimal.ZERO;
            int count = 0;
            for (int j = Math.max(0, i - period + 1); j <= i; j++) {
                if (values.get(j) != null) {
                    sum = sum.add(values.get(j));
                    count++;
                }
            }

            if (count > 0) {
                result.add(sum.divide(BigDecimal.valueOf(count), 4, RoundingMode.HALF_UP));
            } else {
                result.add(null);
            }
        }
        return result;
    }
}

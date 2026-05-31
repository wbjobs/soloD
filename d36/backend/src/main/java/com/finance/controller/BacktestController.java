package com.finance.controller;

import com.finance.model.backtest.BacktestResult;
import com.finance.model.backtest.StrategyConfig;
import com.finance.service.backtest.BacktestService;
import com.finance.service.backtest.HistoricalDataService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Slf4j
@RestController
@RequestMapping("/api/backtest")
@RequiredArgsConstructor
@CrossOrigin(origins = "http://localhost:4200")
public class BacktestController {

    private final BacktestService backtestService;
    private final HistoricalDataService historicalDataService;

    @PostMapping("/run")
    public ResponseEntity<BacktestResult> runBacktest(@RequestBody StrategyConfig config) {
        log.info("Running backtest for symbol: {}, strategy: {}", config.getSymbol(), config.getType());
        BacktestResult result = backtestService.runBacktest(config);
        return ResponseEntity.ok(result);
    }

    @GetMapping("/symbols")
    public ResponseEntity<List<String>> getAvailableSymbols() {
        return ResponseEntity.ok(historicalDataService.getAvailableSymbols());
    }

    @GetMapping("/strategies")
    public ResponseEntity<List<String>> getAvailableStrategies() {
        return ResponseEntity.ok(List.of(
                "MA_CROSSOVER",
                "RSI",
                "BOLLINGER_BANDS",
                "MACD",
                "KDJ"
        ));
    }
}

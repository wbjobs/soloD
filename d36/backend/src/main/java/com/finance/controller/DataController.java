package com.finance.controller;

import com.finance.model.AggregatedData;
import com.finance.model.TickData;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@CrossOrigin(origins = "*")
public class DataController {

    private final Map<String, List<AggregatedData>> aggregatedDataCache = new HashMap<>();
    private final Map<String, List<TickData>> tickDataCache = new HashMap<>();

    @GetMapping("/symbols")
    public List<String> getSymbols() {
        return List.of("AAPL", "GOOGL", "MSFT", "AMZN", "BABA");
    }

    @GetMapping("/ticks/{symbol}")
    public List<TickData> getTickData(@PathVariable String symbol) {
        return tickDataCache.getOrDefault(symbol, new ArrayList<>());
    }

    @GetMapping("/aggregated/{symbol}")
    public List<AggregatedData> getAggregatedData(@PathVariable String symbol) {
        return aggregatedDataCache.getOrDefault(symbol, new ArrayList<>());
    }

    @PostMapping("/aggregated")
    public void addAggregatedData(@RequestBody AggregatedData data) {
        aggregatedDataCache.computeIfAbsent(data.getSymbol(), k -> new ArrayList<>()).add(data);
        if (aggregatedDataCache.get(data.getSymbol()).size() > 100) {
            aggregatedDataCache.get(data.getSymbol()).remove(0);
        }
    }

    @PostMapping("/ticks")
    public void addTickData(@RequestBody TickData data) {
        tickDataCache.computeIfAbsent(data.getSymbol(), k -> new ArrayList<>()).add(data);
        if (tickDataCache.get(data.getSymbol()).size() > 1000) {
            tickDataCache.get(data.getSymbol()).remove(0);
        }
    }
}

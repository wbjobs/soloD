package com.finance.service;

import com.finance.model.AggregatedData;
import com.finance.model.Alert;
import com.finance.model.TickData;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class WebSocketService {

    private final SimpMessagingTemplate messagingTemplate;

    public void broadcastTickData(TickData tickData) {
        messagingTemplate.convertAndSend("/topic/ticks", tickData);
    }

    public void broadcastAggregatedData(AggregatedData aggregatedData) {
        messagingTemplate.convertAndSend("/topic/aggregated", aggregatedData);
    }

    public void broadcastAlert(Alert alert) {
        messagingTemplate.convertAndSend("/topic/alerts", alert);
    }
}

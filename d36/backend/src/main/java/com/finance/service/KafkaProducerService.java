package com.finance.service;

import com.finance.model.AggregatedData;
import com.finance.model.Alert;
import com.finance.model.TickData;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class KafkaProducerService {

    private final KafkaTemplate<String, Object> kafkaTemplate;

    @Value("${kafka.topics.tick-data}")
    private String tickDataTopic;

    @Value("${kafka.topics.aggregated-data}")
    private String aggregatedDataTopic;

    @Value("${kafka.topics.alerts}")
    private String alertsTopic;

    public void sendTickData(TickData tickData) {
        kafkaTemplate.send(tickDataTopic, tickData.getSymbol(), tickData);
        log.debug("Sent tick data: {}", tickData);
    }

    public void sendAggregatedData(AggregatedData aggregatedData) {
        kafkaTemplate.send(aggregatedDataTopic, aggregatedData.getSymbol(), aggregatedData);
        log.debug("Sent aggregated data: {}", aggregatedData);
    }

    public void sendAlert(Alert alert) {
        kafkaTemplate.send(alertsTopic, alert.getSymbol(), alert);
        log.debug("Sent alert: {}", alert);
    }
}

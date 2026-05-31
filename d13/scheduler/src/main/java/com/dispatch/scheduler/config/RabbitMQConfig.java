package com.dispatch.scheduler.config;

import org.springframework.amqp.core.FanoutExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RabbitMQConfig {

    @Value("${rabbitmq.queue.task}")
    private String taskQueue;

    @Value("${rabbitmq.queue.result}")
    private String resultQueue;

    @Value("${rabbitmq.queue.control}")
    private String controlQueue;

    @Bean
    public Queue taskQueue() {
        return new Queue(taskQueue, true);
    }

    @Bean
    public Queue resultQueue() {
        return new Queue(resultQueue, true);
    }

    @Bean
    public FanoutExchange controlExchange() {
        return new FanoutExchange("control.exchange");
    }

    @Bean
    public Jackson2JsonMessageConverter jsonMessageConverter() {
        return new Jackson2JsonMessageConverter();
    }

    @Bean
    public RabbitTemplate rabbitTemplate(ConnectionFactory connectionFactory) {
        RabbitTemplate rabbitTemplate = new RabbitTemplate(connectionFactory);
        rabbitTemplate.setMessageConverter(jsonMessageConverter());
        return rabbitTemplate;
    }
}

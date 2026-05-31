package com.dispatch.scheduler.messaging;

import com.dispatch.scheduler.dto.TaskResult;
import com.dispatch.scheduler.service.TaskService;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

@Component
public class ResultConsumer {

    private final TaskService taskService;

    public ResultConsumer(TaskService taskService) {
        this.taskService = taskService;
    }

    @RabbitListener(queues = "${rabbitmq.queue.result}")
    public void receiveResult(TaskResult result) {
        taskService.handleTaskResult(result);
    }
}

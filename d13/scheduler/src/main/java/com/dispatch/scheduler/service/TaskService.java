package com.dispatch.scheduler.service;

import com.dispatch.scheduler.dto.ControlMessage;
import com.dispatch.scheduler.dto.TaskMessage;
import com.dispatch.scheduler.dto.TaskResult;
import com.dispatch.scheduler.dto.TaskSubmissionRequest;
import com.dispatch.scheduler.model.Task;
import com.dispatch.scheduler.model.TaskStatus;
import com.dispatch.scheduler.repository.TaskRepository;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class TaskService {

    private static final int DEFAULT_TIMEOUT_SECONDS = 3600;

    private final TaskRepository taskRepository;
    private final RabbitTemplate rabbitTemplate;

    @Value("${rabbitmq.queue.task}")
    private String taskQueue;

    @Value("${rabbitmq.queue.control}")
    private String controlQueue;

    public TaskService(TaskRepository taskRepository, RabbitTemplate rabbitTemplate) {
        this.taskRepository = taskRepository;
        this.rabbitTemplate = rabbitTemplate;
    }

    @Transactional
    public Task submitTask(TaskSubmissionRequest request) {
        Task task = new Task();
        task.setId(UUID.randomUUID().toString());
        task.setName(request.getName());
        task.setCommand(request.getCommand());
        task.setDependencies(request.getDependencies() != null ? request.getDependencies() : List.of());
        task.setTimeout(request.getTimeout());
        task.setStatus(TaskStatus.PENDING);
        return taskRepository.save(task);
    }

    @Scheduled(fixedDelay = 1000)
    @Transactional
    public void scheduleReadyTasks() {
        List<Task> pendingTasks = taskRepository.findByStatus(TaskStatus.PENDING);
        Map<String, Task> allTasks = taskRepository.findAll().stream()
                .collect(Collectors.toMap(Task::getId, t -> t));

        for (Task task : pendingTasks) {
            if (areDependenciesCompleted(task, allTasks)) {
                task.setStatus(TaskStatus.READY);
                taskRepository.save(task);
            }
        }

        List<Task> readyTasks = taskRepository.findByStatus(TaskStatus.READY);
        for (Task task : readyTasks) {
            task.setStatus(TaskStatus.RUNNING);
            task.setStartedAt(LocalDateTime.now());
            taskRepository.save(task);
            
            Integer taskTimeout = task.getTimeout() != null ? task.getTimeout() : DEFAULT_TIMEOUT_SECONDS;
            TaskMessage message = new TaskMessage(task.getId(), task.getCommand(), taskTimeout);
            rabbitTemplate.convertAndSend(taskQueue, message);
        }
    }

    @Scheduled(fixedDelay = 5000)
    @Transactional
    public void checkTimeouts() {
        List<Task> runningTasks = taskRepository.findByStatus(TaskStatus.RUNNING);
        LocalDateTime now = LocalDateTime.now();

        for (Task task : runningTasks) {
            if (task.getStartedAt() == null) {
                continue;
            }

            int timeoutSeconds = task.getTimeout() != null ? task.getTimeout() : DEFAULT_TIMEOUT_SECONDS;
            long elapsedSeconds = Duration.between(task.getStartedAt(), now).getSeconds();

            if (elapsedSeconds > timeoutSeconds) {
                task.setStatus(TaskStatus.TIMEOUT);
                task.setCompletedAt(now);
                task.setStderr("Task timed out after " + timeoutSeconds + " seconds");
                task.setOutput("Task timed out after " + timeoutSeconds + " seconds");
                task.setExitCode(-1);
                taskRepository.save(task);

                ControlMessage killMessage = new ControlMessage("KILL", task.getId(), "TIMEOUT");
                rabbitTemplate.convertAndSend("control.exchange", "", killMessage);
                
                System.out.println("Task " + task.getId() + " timed out, sent kill signal to worker");
            }
        }
    }

    private boolean areDependenciesCompleted(Task task, Map<String, Task> allTasks) {
        if (task.getDependencies() == null || task.getDependencies().isEmpty()) {
            return true;
        }
        for (String depId : task.getDependencies()) {
            Task depTask = allTasks.get(depId);
            if (depTask == null || depTask.getStatus() != TaskStatus.COMPLETED) {
                return false;
            }
        }
        return true;
    }

    @Transactional
    public void handleTaskResult(TaskResult result) {
        Optional<Task> optionalTask = taskRepository.findById(result.getTaskId());
        if (optionalTask.isPresent()) {
            Task task = optionalTask.get();
            if (task.getStatus() == TaskStatus.TIMEOUT) {
                System.out.println("Received result for already timed out task: " + result.getTaskId());
                return;
            }
            task.setStatus(result.isSuccess() ? TaskStatus.COMPLETED : TaskStatus.FAILED);
            task.setWorkerId(result.getWorkerId());
            task.setOutput(result.getOutput());
            task.setStdout(result.getStdout());
            task.setStderr(result.getStderr());
            task.setExitCode(result.getExitCode());
            task.setCompletedAt(LocalDateTime.now());
            taskRepository.save(task);
        }
    }

    public List<Task> getAllTasks() {
        return taskRepository.findAll();
    }

    public Optional<Task> getTaskById(String id) {
        return taskRepository.findById(id);
    }
}

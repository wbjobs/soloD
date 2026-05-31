package com.dispatch.scheduler.dto;

import lombok.Data;

@Data
public class TaskResult {
    private String taskId;
    private String workerId;
    private boolean success;
    private String output;
    private String stdout;
    private String stderr;
    private Integer exitCode;
}

package com.dispatch.scheduler.dto;

import lombok.Data;
import java.util.List;

@Data
public class TaskSubmissionRequest {
    private String name;
    private String command;
    private List<String> dependencies;
    private Integer timeout; // 超时时间（秒）
}

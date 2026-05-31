package com.dispatch.scheduler.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ControlMessage {
    private String type; // "KILL" - 终止任务
    private String taskId;
    private String reason;
}

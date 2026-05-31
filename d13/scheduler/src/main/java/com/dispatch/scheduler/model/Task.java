package com.dispatch.scheduler.model;

import jakarta.persistence.*;
import lombok.Data;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Data
@Entity
@Table(name = "tasks")
public class Task {
    @Id
    private String id;
    
    private String name;
    
    @Column(length = 1000)
    private String command;
    
    private Integer timeout; // 超时时间（秒），null表示使用默认值3600秒
    
    @Enumerated(EnumType.STRING)
    private TaskStatus status;
    
    private String workerId;
    
    @Column(length = 2000)
    private String output;
    
    @Column(length = 2000)
    private String stdout;
    
    @Column(length = 2000)
    private String stderr;
    
    private Integer exitCode;
    
    private LocalDateTime createdAt;
    private LocalDateTime startedAt;
    private LocalDateTime completedAt;
    
    @ElementCollection(fetch = FetchType.EAGER)
    private List<String> dependencies = new ArrayList<>();
    
    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        if (status == null) {
            status = TaskStatus.PENDING;
        }
    }
}

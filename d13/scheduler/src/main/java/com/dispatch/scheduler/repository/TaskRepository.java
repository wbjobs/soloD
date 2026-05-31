package com.dispatch.scheduler.repository;

import com.dispatch.scheduler.model.Task;
import com.dispatch.scheduler.model.TaskStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TaskRepository extends JpaRepository<Task, String> {
    List<Task> findByStatus(TaskStatus status);
    List<Task> findByStatusIn(List<TaskStatus> statuses);
}

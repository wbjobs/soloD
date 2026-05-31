#!/usr/bin/env python3
import requests
import time
import json

BASE_URL = "http://localhost:8080/api/tasks"

def submit_task(name, command, dependencies=None):
    payload = {
        "name": name,
        "command": command,
        "dependencies": dependencies or []
    }
    response = requests.post(BASE_URL, json=payload)
    result = response.json()
    print(f"Submitted task: {name}, ID: {result['id']}")
    return result['id']

def get_task(task_id):
    response = requests.get(f"{BASE_URL}/{task_id}")
    return response.json()

def get_all_tasks():
    response = requests.get(BASE_URL)
    return response.json()

def print_task_status(task_id):
    task = get_task(task_id)
    print(f"Task {task['name']} ({task['id']}): {task['status']}")
    if task.get('exitCode') is not None:
        print(f"  Exit Code: {task['exitCode']}")
    if task.get('stdout'):
        print(f"  STDOUT: {task['stdout'][:100]}")
    if task.get('stderr'):
        print(f"  STDERR: {task['stderr'][:100]}")
    print()

def main():
    print("=== Testing Distributed Task Scheduler ===\n")
    
    # 提交任务 A (2秒)
    task_a = submit_task("Task-A", "echo 'Hello from Task A' && sleep 2")
    
    # 提交任务 B，依赖任务 A (1秒)
    task_b = submit_task("Task-B", "echo 'Hello from Task B (depends on A)' && sleep 1", 
                        dependencies=[task_a])
    
    # 提交任务 C，无依赖（会产生 stdout/stderr）
    task_c = submit_task("Task-C", "echo 'This goes to stdout' && echo 'This goes to stderr' >&2 && exit 0")
    
    # 提交任务 D，会失败（退出码非0）
    task_d = submit_task("Task-D", "echo 'About to fail' && exit 1")
    
    # 提交任务 E，超时任务（sleep 10秒，超时 3秒）
    task_e = submit_task("Task-E", "echo 'This task will timeout' && sleep 10 && echo 'Should not see this'", 
                        timeout=3)
    
    print("\n=== Task DAG ===")
    print(f"Task A: {task_a}")
    print(f"Task B: {task_b} (depends on A)")
    print(f"Task C: {task_c} (tests stdout/stderr)")
    print(f"Task D: {task_d} (will fail)")
    print(f"Task E: {task_e} (will timeout in 3s, but sleeps 10s)")
    print()
    
    # 监控任务状态
    print("=== Monitoring Task Status ===")
    for i in range(20):
        print(f"\n--- Check {i+1} ---")
        print_task_status(task_a)
        print_task_status(task_b)
        print_task_status(task_c)
        print_task_status(task_d)
        print_task_status(task_e)
        time.sleep(2)

if __name__ == "__main__":
    main()

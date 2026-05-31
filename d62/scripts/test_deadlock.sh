#!/bin/bash

echo "=== 死锁检测模块测试脚本"
echo ""

BASE_URL="http://localhost:8080/api/v1"

echo "1. 创建任务A..."
TASK_A=$(curl -s -X POST "$BASE_URL/tasks" \
    -H "Content-Type: application/json" \
    -d '{"name": "任务A", "priority": 1, "max_retries": 3, "worker_id": "worker-1"}')
echo "$TASK_A" | python3 -m json.tool
TASK_A_ID=$(echo "$TASK_A" | python3 -c "import sys,json; print(json.load(sys.stdin)['task']['id'])")
echo "任务A ID: $TASK_A_ID"
echo ""

echo "2. 创建任务B..."
TASK_B=$(curl -s -X POST "$BASE_URL/tasks" \
    -H "Content-Type: application/json" \
    -d '{"name": "任务B", "priority": 2, "max_retries": 3, "worker_id": "worker-2"}')
echo "$TASK_B" | python3 -m json.tool
TASK_B_ID=$(echo "$TASK_B" | python3 -c "import sys,json; print(json.load(sys.stdin)['task']['id'])")
echo "任务B ID: $TASK_B_ID"
echo ""

echo "3. 启动任务A..."
curl -s -X POST "$BASE_URL/tasks/$TASK_A_ID/start" | python3 -m json.tool
echo ""

echo "4. 启动任务B..."
curl -s -X POST "$BASE_URL/tasks/$TASK_B_ID/start" | python3 -m json.tool
echo ""

echo "5. 任务A持有资源X..."
curl -s -X POST "$BASE_URL/locks" \
    -H "Content-Type: application/json" \
    -d "{\"task_id\": $TASK_A_ID, \"resource\": \"resource_X\", \"is_held\": true}" | python3 -m json.tool
echo ""

echo "6. 任务B持有资源Y..."
curl -s -X POST "$BASE_URL/locks" \
    -H "Content-Type: application/json" \
    -d "{\"task_id\": $TASK_B_ID, \"resource\": \"resource_Y\", \"is_held\": true}" | python3 -m json.tool
echo ""

echo "7. 任务A等待资源Y (由任务B持有)..."
curl -s -X POST "$BASE_URL/locks" \
    -H "Content-Type: application/json" \
    -d "{\"task_id\": $TASK_B_ID, \"resource\": \"resource_Y\", \"is_held\": false, \"wait_task_id\": $TASK_A_ID}" | python3 -m json.tool
echo ""

echo "8. 任务B等待资源X (由任务A持有)..."
curl -s -X POST "$BASE_URL/locks" \
    -H "Content-Type: application/json" \
    -d "{\"task_id\": $TASK_A_ID, \"resource\": \"resource_X\", \"is_held\": false, \"wait_task_id\": $TASK_B_ID}" | python3 -m json.tool
echo ""

echo "9. 查看当前资源锁状态..."
curl -s "$BASE_URL/locks" | python3 -m json.tool
echo ""

echo "10. 手动触发死锁检测..."
curl -s -X POST "$BASE_URL/deadlock/detect" | python3 -m json.tool
echo ""

echo "11. 查看死锁历史记录..."
curl -s "$BASE_URL/deadlock/history" | python3 -m json.tool
echo ""

echo "=== 测试完成，请查看结果 ==="

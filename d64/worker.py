import zmq
import time
import sys
import threading
import json
import uuid

def fibonacci(n):
    if n <= 0:
        return 0
    elif n == 1:
        return 1
    else:
        return fibonacci(n - 1) + fibonacci(n - 2)

class HeartbeatSender:
    def __init__(self, socket, worker_id, interval=5):
        self.socket = socket
        self.worker_id = worker_id
        self.interval = interval
        self.running = True
        self.thread = threading.Thread(target=self._send_heartbeat, daemon=True)
    
    def start(self):
        self.thread.start()
    
    def stop(self):
        self.running = False
    
    def _send_heartbeat(self):
        while self.running:
            heartbeat = {
                "type": "heartbeat",
                "status": "alive",
                "worker_id": self.worker_id,
                "timestamp": time.time()
            }
            self.socket.send_string(json.dumps(heartbeat))
            time.sleep(self.interval)

def main():
    context = zmq.Context()
    
    worker_id = str(uuid.uuid4())[:8]
    
    receiver = context.socket(zmq.PULL)
    receiver.connect("tcp://localhost:5557")
    print(f"Worker [{worker_id}] 已连接到 Publisher (tcp://localhost:5557)")
    
    sender = context.socket(zmq.PUSH)
    sender.connect("tcp://localhost:5558")
    print(f"Worker [{worker_id}] 已连接到 Sink (tcp://localhost:5558)")
    
    heartbeat_sender = HeartbeatSender(sender, worker_id, interval=5)
    heartbeat_sender.start()
    print(f"Worker [{worker_id}] 心跳机制已启动 (每5秒发送一次)")
    print("=" * 60)
    print("Worker 准备就绪，等待任务...")
    print("=" * 60)
    
    task_count = 0
    
    try:
        while True:
            message = receiver.recv_string()
            parts = message.split(',')
            
            if len(parts) < 2:
                print(f"收到无效消息: {message}")
                continue
            
            task_id = int(parts[0])
            number = int(parts[1])
            
            task_count += 1
            print(f"[{task_count}] 收到任务 #{task_id}，计算 Fibonacci({number})...")
            
            start_time = time.time()
            result = fibonacci(number)
            elapsed = time.time() - start_time
            
            print(f"[{task_count}] 任务 #{task_id} 完成: Fibonacci({number}) = {result}")
            
            result_message = {
                "type": "result",
                "task_id": task_id,
                "number": number,
                "result": result,
                "elapsed": elapsed,
                "worker_id": worker_id
            }
            sender.send_string(json.dumps(result_message))
            
    except KeyboardInterrupt:
        print(f"\nWorker [{worker_id}] 正在退出... 共处理 {task_count} 个任务")
        heartbeat_sender.stop()
    except Exception as e:
        print(f"错误: {e}")
        heartbeat_sender.stop()
    finally:
        receiver.close()
        sender.close()
        context.term()

if __name__ == "__main__":
    main()

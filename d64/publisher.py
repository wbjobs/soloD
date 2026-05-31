import zmq
import time
import sys

def main():
    context = zmq.Context()
    socket = context.socket(zmq.PUSH)
    
    print("启动 Publisher，绑定到 tcp://*:5557")
    socket.bind("tcp://*:5557")
    
    filename = sys.argv[1] if len(sys.argv) > 1 else "tasks.txt"
    
    try:
        with open(filename, 'r') as f:
            lines = f.readlines()
    except FileNotFoundError:
        print(f"无法打开文件: {filename}")
        return 1
    
    task_id = 0
    
    print("等待 Worker 连接... (2秒)")
    time.sleep(2)
    
    print("开始发送任务...")
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        task_id += 1
        message = f"{task_id},{line}"
        
        print(f"发送任务 #{task_id}: {line}")
        socket.send_string(message)
        
        time.sleep(0.1)
    
    print(f"所有任务发送完成，共 {task_id} 个任务")
    
    time.sleep(1)
    
    socket.close()
    context.term()
    
    return 0

if __name__ == "__main__":
    sys.exit(main())

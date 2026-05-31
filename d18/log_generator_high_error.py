import socket
import json
import random
import time
import uuid
from datetime import datetime

UDP_IP = "127.0.0.1"
UDP_PORT = 9000

MICROSERVICES = [
    "user-service",
    "order-service",
    "payment-service",
    "inventory-service",
    "notification-service"
]

LOG_LEVELS = ["DEBUG", "INFO", "WARN", "ERROR"]

MESSAGES = {
    "DEBUG": [
        "Connecting to database",
        "Cache hit for key",
        "Configuration loaded",
        "Health check passed"
    ],
    "INFO": [
        "User logged in successfully",
        "Order processed",
        "Payment received",
        "Inventory updated",
        "Notification sent",
        "Request completed"
    ],
    "WARN": [
        "High memory usage detected",
        "Slow database query",
        "Retrying failed operation",
        "Rate limit approaching"
    ],
    "ERROR": [
        "Database connection failed",
        "Payment processing error",
        "Invalid user input",
        "Service unavailable",
        "Null pointer exception"
    ]
}

def generate_log():
    service = random.choice(MICROSERVICES)
    # 高ERROR概率: 40%
    r = random.random()
    if r < 0.4:
        level = "ERROR"
    elif r < 0.6:
        level = "WARN"
    elif r < 0.85:
        level = "INFO"
    else:
        level = "DEBUG"
    
    message = random.choice(MESSAGES[level])
    
    log = {
        "id": str(uuid.uuid4()),
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "service": service,
        "level": level,
        "message": message,
        "trace_id": str(uuid.uuid4())[:8],
        "duration_ms": random.randint(1, 500)
    }
    
    return json.dumps(log).encode('utf-8')

def main():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    print(f"🚨 HIGH ERROR Log Generator started (40% ERROR rate)")
    print(f"Sending logs to {UDP_IP}:{UDP_PORT}")
    print("Press Ctrl+C to stop...\n")
    
    count = 0
    error_count = 0
    start_time = time.time()
    
    try:
        while True:
            num_logs = random.randint(2, 8)
            for _ in range(num_logs):
                log_data = generate_log()
                sock.sendto(log_data, (UDP_IP, UDP_PORT))
                count += 1
                if b'"ERROR"' in log_data:
                    error_count += 1
            
            elapsed = time.time() - start_time
            if elapsed >= 1:
                rate = count / elapsed
                error_rate = error_count / elapsed
                print(f"Sent: {count} logs ({rate:.0f}/s), ERROR: {error_count} ({error_rate:.0f}/s)", end='\r')
            
            time.sleep(random.uniform(0.01, 0.05))
    except KeyboardInterrupt:
        elapsed = time.time() - start_time
        print(f"\n\nLog generator stopped.")
        print(f"Total sent: {count} logs in {elapsed:.1f}s")
        print(f"ERROR logs: {error_count} ({error_count/count*100:.1f}%)")
    finally:
        sock.close()

if __name__ == "__main__":
    main()

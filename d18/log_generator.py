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
    level = random.choice(LOG_LEVELS)
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
    print(f"Log generator started. Sending logs to {UDP_IP}:{UDP_PORT}")
    print("Press Ctrl+C to stop...")
    
    try:
        while True:
            num_logs = random.randint(1, 5)
            for _ in range(num_logs):
                log_data = generate_log()
                sock.sendto(log_data, (UDP_IP, UDP_PORT))
            
            time.sleep(random.uniform(0.1, 0.5))
    except KeyboardInterrupt:
        print("\nLog generator stopped.")
    finally:
        sock.close()

if __name__ == "__main__":
    main()

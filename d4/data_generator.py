import requests
import uuid
import random
import time
from datetime import datetime, timedelta
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

API_URL = "http://localhost:8000/api/events"

EVENT_TYPES = ["page_view", "click", "add_to_cart", "checkout", "search"]
COUNTRIES = ["China", "USA", "Japan", "UK", "Germany", "France", "Canada", "Australia", "India", "Brazil"]
DEVICES = ["desktop", "mobile", "tablet"]
BROWSERS = ["Chrome", "Firefox", "Safari", "Edge", "Opera"]
OS = ["Windows", "MacOS", "iOS", "Android", "Linux", "Ubuntu"]
PAGES = ["/", "/product", "/cart", "/checkout", "/search", "/about", "/contact", "/login", "/register"]

USER_COUNT = 1000
BATCH_SIZE = 100
INTERVAL = 0.5

def generate_event(user_id=None, session_id=None):
    if not user_id:
        user_id = f"user_{random.randint(1, USER_COUNT)}"
    if not session_id:
        session_id = f"session_{uuid.uuid4().hex[:12]}"
    
    return {
        "user_id": user_id,
        "session_id": session_id,
        "event_type": random.choice(EVENT_TYPES),
        "page_url": random.choice(PAGES),
        "referrer": "",
        "user_agent": f"{random.choice(BROWSERS)}/100.0",
        "ip_address": f"{random.randint(1,255)}.{random.randint(1,255)}.{random.randint(1,255)}.{random.randint(1,255)}",
        "country": random.choice(COUNTRIES),
        "city": "",
        "device_type": random.choice(DEVICES),
        "browser": random.choice(BROWSERS),
        "os": random.choice(OS),
        "event_properties": {},
        "timestamp": datetime.now().isoformat()
    }

def generate_batch(size=BATCH_SIZE):
    sessions = {}
    events = []
    
    for _ in range(size):
        user_id = f"user_{random.randint(1, USER_COUNT)}"
        if user_id not in sessions:
            sessions[user_id] = f"session_{uuid.uuid4().hex[:12]}"
        events.append(generate_event(user_id, sessions[user_id]))
    
    return events

def send_batch(events):
    try:
        response = requests.post(API_URL, json=events, timeout=10)
        response.raise_for_status()
        return response.json()
    except Exception as e:
        logger.error(f"Failed to send batch: {str(e)}")
        return None

def main():
    logger.info("Starting data generator...")
    logger.info(f"Target: {API_URL}")
    
    total_sent = 0
    start_time = time.time()
    
    try:
        while True:
            batch = generate_batch()
            result = send_batch(batch)
            
            if result:
                total_sent += len(batch)
                elapsed = time.time() - start_time
                rate = total_sent / elapsed
                logger.info(f"Sent {len(batch)} events, total: {total_sent}, rate: {rate:.1f} events/sec")
            
            time.sleep(INTERVAL)
            
    except KeyboardInterrupt:
        logger.info(f"Stopped. Total events sent: {total_sent}")

if __name__ == "__main__":
    main()

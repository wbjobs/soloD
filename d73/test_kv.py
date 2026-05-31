import requests
import time
import sys

BASE_PORTS = [8001, 8002, 8003]


def check_node_status(port, timeout=2):
    try:
        response = requests.get(f"http://localhost:{port}/status", timeout=timeout)
        if response.status_code == 200:
            return response.json()
    except:
        pass
    return None


def find_leader(max_wait=30):
    print("Waiting for leader election...")
    start_time = time.time()
    while time.time() - start_time < max_wait:
        for port in BASE_PORTS:
            status = check_node_status(port)
            if status and status.get("is_leader"):
                print(f"Found leader on port {port} (node {status.get('node_id')})")
                return port, status
        print(".", end="", flush=True)
        time.sleep(1)
    print("\nWARNING: No leader found within timeout")
    return None, None


def test_put_get():
    print("\n" + "=" * 60)
    print("Testing PUT and GET operations")
    print("=" * 60)
    
    leader_port, leader_status = find_leader()
    if not leader_port:
        print("ERROR: No leader available")
        return False
    
    test_key = "test_key"
    test_value = {"name": "test", "value": 123, "nested": {"a": 1}}
    
    print(f"\n1. PUT {test_key} = {test_value}")
    try:
        response = requests.post(
            f"http://localhost:{leader_port}/put",
            json={"key": test_key, "value": test_value},
            timeout=5
        )
        print(f"   Response: {response.status_code}")
        if response.status_code != 200:
            print(f"   ERROR: {response.text}")
            return False
    except Exception as e:
        print(f"   ERROR: {e}")
        return False
    
    print("\n2. Waiting for log replication...")
    time.sleep(2)
    
    print("\n3. GET from all nodes to verify replication:")
    all_success = True
    for port in BASE_PORTS:
        status = check_node_status(port)
        if not status:
            print(f"   Node {port}: OFFLINE")
            all_success = False
            continue
        
        try:
            response = requests.get(f"http://localhost:{port}/get/{test_key}", timeout=2)
            if response.status_code == 200:
                data = response.json()
                if data.get("value") == test_value:
                    print(f"   Node {port} ({status['node_id']}): OK - data matches")
                else:
                    print(f"   Node {port} ({status['node_id']}): ERROR - data mismatch!")
                    all_success = False
            else:
                print(f"   Node {port} ({status['node_id']}): HTTP {response.status_code}")
                all_success = False
        except Exception as e:
            print(f"   Node {port}: ERROR - {e}")
            all_success = False
    
    return all_success


def test_status():
    print("\n" + "=" * 60)
    print("Node Status")
    print("=" * 60)
    
    for port in BASE_PORTS:
        status = check_node_status(port)
        if status:
            leader_marker = " [LEADER]" if status.get("is_leader") else ""
            print(f"\nNode on port {port} ({status['node_id']}){leader_marker}:")
            print(f"  Current Term: {status['current_term']}")
            print(f"  Commit Index: {status['commit_index']}")
            print(f"  Last Applied: {status['last_applied']}")
        else:
            print(f"\nNode on port {port}: OFFLINE")


def main():
    print("=" * 60)
    print("Distributed KV Store Test")
    print("=" * 60)
    print("\nMake sure all nodes are running (use start_all.py)\n")
    
    test_status()
    
    success = test_put_get()
    
    print("\n" + "=" * 60)
    if success:
        print("TEST PASSED! All operations completed successfully.")
    else:
        print("TEST FAILED! Some operations did not complete correctly.")
        sys.exit(1)
    print("=" * 60)


if __name__ == "__main__":
    main()

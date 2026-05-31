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
    print("Waiting for leader election...", end="", flush=True)
    start_time = time.time()
    while time.time() - start_time < max_wait:
        for port in BASE_PORTS:
            status = check_node_status(port)
            if status and status.get("is_leader"):
                print(f" found leader on port {port} (node {status.get('node_id')})")
                return port, status
        print(".", end="", flush=True)
        time.sleep(1)
    print("\nWARNING: No leader found within timeout")
    return None, None


def put_key(port, key, value):
    try:
        response = requests.post(
            f"http://localhost:{port}/put",
            json={"key": key, "value": value},
            timeout=5
        )
        return response.status_code == 200
    except Exception as e:
        print(f"PUT error: {e}")
        return False


def get_key(port, key):
    try:
        response = requests.get(f"http://localhost:{port}/get/{key}", timeout=2)
        if response.status_code == 200:
            return response.json().get("value")
    except:
        pass
    return None


def force_snapshot(port):
    try:
        response = requests.post(f"http://localhost:{port}/snapshot/force", timeout=10)
        return response.json()
    except Exception as e:
        print(f"Force snapshot error: {e}")
        return None


def print_snapshot_stats():
    print("\n--- Snapshot Stats ---")
    for port in BASE_PORTS:
        status = check_node_status(port)
        if status:
            snap = status.get("snapshot", {})
            print(f"Node port {port}:")
            print(f"  Snapshot Index: {snap.get('snapshot_index')}")
            print(f"  Log Count: {snap.get('log_count')}")
            print(f"  Total Logs: {snap.get('total_logs')}")
            print(f"  Threshold: {snap.get('threshold')}")
        else:
            print(f"Node port {port}: OFFLINE")


def main():
    print("=" * 60)
    print("Snapshot Feature Test")
    print("=" * 60)
    
    leader_port, leader_status = find_leader()
    if not leader_port:
        print("ERROR: No leader available")
        sys.exit(1)
    
    print_snapshot_stats()
    
    print(f"\nInserting test data via leader (port {leader_port})...")
    num_entries = 50
    for i in range(num_entries):
        key = f"test_key_{i}"
        value = {"index": i, "data": f"value_{i}"}
        success = put_key(leader_port, key, value)
        if (i + 1) % 10 == 0:
            print(f"  Inserted {i + 1}/{num_entries} entries")
        time.sleep(0.01)
    
    print("\nWaiting for entries to be committed...")
    time.sleep(2)
    
    print_snapshot_stats()
    
    print("\nVerifying data consistency across all nodes...")
    all_ok = True
    for i in range(num_entries):
        key = f"test_key_{i}"
        expected_value = {"index": i, "data": f"value_{i}"}
        
        for port in BASE_PORTS:
            actual_value = get_key(port, key)
            if actual_value != expected_value:
                print(f"  MISMATCH on port {port}: key={key}")
                all_ok = False
                break
    
    if all_ok:
        print(f"  All {num_entries} entries verified successfully on all nodes!")
    else:
        print("  Data verification FAILED!")
    
    print("\nForcing snapshot creation...")
    result = force_snapshot(leader_port)
    if result and result.get("status") == "ok":
        print("  Snapshot created successfully!")
        stats = result.get("stats", {})
        print(f"  New snapshot index: {stats.get('snapshot_index')}")
        print(f"  Remaining logs: {stats.get('log_count')}")
    else:
        print("  Snapshot creation failed or not needed (no applied entries)")
    
    time.sleep(1)
    print_snapshot_stats()
    
    print("\n" + "=" * 60)
    print("TEST COMPLETED")
    print("=" * 60)
    print("\nTo test snapshot persistence:")
    print("1. Stop all nodes")
    print("2. Restart all nodes")
    print("3. Verify the data is still accessible via GET requests")


if __name__ == "__main__":
    main()

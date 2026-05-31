import subprocess
import sys
import time
import os
import shutil

processes = []

def cleanup_data():
    data_dir = os.path.join(os.path.dirname(__file__), "data")
    if os.path.exists(data_dir):
        print("Cleaning up existing data directory...")
        shutil.rmtree(data_dir)
        print("Data directory cleaned.")

try:
    print("=" * 60)
    print("Distributed KV Store - Starting All Nodes")
    print("=" * 60)
    
    cleanup_data()
    
    print("\nGenerating gRPC code...")
    result = subprocess.run([sys.executable, "generate_grpc.py"], capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error generating gRPC code: {result.stderr}")
        sys.exit(1)
    print("gRPC code generated successfully.")
    
    print("\nStarting node1...")
    p1 = subprocess.Popen([sys.executable, "node.py", "node1"])
    processes.append(("node1", p1))
    
    time.sleep(3)
    
    print("\nStarting node2...")
    p2 = subprocess.Popen([sys.executable, "node.py", "node2"])
    processes.append(("node2", p2))
    
    time.sleep(3)
    
    print("\nStarting node3...")
    p3 = subprocess.Popen([sys.executable, "node.py", "node3"])
    processes.append(("node3", p3))
    
    print("\n" + "=" * 60)
    print("All nodes started!")
    print("HTTP endpoints:")
    print("  node1: http://localhost:8001")
    print("  node2: http://localhost:8002")
    print("  node3: http://localhost:8003")
    print("=" * 60)
    print("\nWaiting for leader election (approx. 5-10 seconds)...")
    print("\nPress Ctrl+C to stop all nodes.\n")
    
    while True:
        time.sleep(1)
        all_dead = True
        for name, p in processes:
            if p.poll() is None:
                all_dead = False
            else:
                print(f"\nWARNING: {name} has exited with code {p.returncode}!")
        
        if all_dead:
            print("\nAll nodes have exited.")
            break

except KeyboardInterrupt:
    print("\n" + "=" * 60)
    print("Stopping all nodes...")
    print("=" * 60)
    
    for name, p in reversed(processes):
        if p.poll() is None:
            print(f"Stopping {name}...")
            p.terminate()
            try:
                p.wait(timeout=3)
            except subprocess.TimeoutExpired:
                print(f"Force killing {name}...")
                p.kill()
    
    print("\nAll nodes stopped.")

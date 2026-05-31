import requests
import time
import json

BASE_URL = "http://localhost:8000"

def example_bell_state():
    print("=== Example: Creating Bell State ===")
    
    circuit = {
        "num_qubits": 2,
        "gates": [
            {"name": "H", "qubits": [0]},
            {"name": "CNOT", "qubits": [0, 1]}
        ]
    }
    
    response = requests.post(f"{BASE_URL}/simulate", json=circuit)
    result = response.json()
    print(f"Task ID: {result['task_id']}")
    print(f"Status: {result['status']}")
    
    task_id = result['task_id']
    
    print("\nWaiting for simulation to complete...")
    time.sleep(2)
    
    status_response = requests.get(f"{BASE_URL}/status/{task_id}")
    status_result = status_response.json()
    
    print(f"\nFinal Status: {status_result['status']}")
    if status_result['status'] == 'completed':
        print("\nMeasurement Probabilities:")
        for prob in status_result['probabilities']:
            print(f"  |{prob['state']}⟩: {prob['probability']:.4f}")
    elif status_result['status'] == 'failed':
        print(f"Error: {status_result['error']}")

def example_ghz_state():
    print("\n=== Example: Creating GHZ State (3 qubits) ===")
    
    circuit = {
        "num_qubits": 3,
        "gates": [
            {"name": "H", "qubits": [0]},
            {"name": "CNOT", "qubits": [0, 1]},
            {"name": "CNOT", "qubits": [1, 2]}
        ]
    }
    
    response = requests.post(f"{BASE_URL}/simulate", json=circuit)
    result = response.json()
    task_id = result['task_id']
    
    time.sleep(2)
    
    status_response = requests.get(f"{BASE_URL}/status/{task_id}")
    status_result = status_response.json()
    
    if status_result['status'] == 'completed':
        print("Measurement Probabilities:")
        for prob in status_result['probabilities']:
            print(f"  |{prob['state']}⟩: {prob['probability']:.4f}")

def example_qft_4qubits():
    print("\n=== Example: 4-qubit Quantum Fourier Transform ===")
    
    circuit = {
        "num_qubits": 4,
        "gates": [
            {"name": "H", "qubits": [0]},
            {"name": "H", "qubits": [1]},
            {"name": "H", "qubits": [2]},
            {"name": "H", "qubits": [3]},
            {"name": "X", "qubits": [1]}
        ]
    }
    
    response = requests.post(f"{BASE_URL}/simulate", json=circuit)
    result = response.json()
    task_id = result['task_id']
    
    time.sleep(2)
    
    status_response = requests.get(f"{BASE_URL}/status/{task_id}")
    status_result = status_response.json()
    
    if status_result['status'] == 'completed':
        print("Measurement Probabilities:")
        for prob in status_result['probabilities']:
            print(f"  |{prob['state']}⟩: {prob['probability']:.4f}")

if __name__ == "__main__":
    print("Quantum Circuit Simulator API Example Usage")
    print("=" * 50)
    print(f"Make sure the server is running at {BASE_URL}")
    print("Run: python main.py\n")
    
    try:
        health_response = requests.get(f"{BASE_URL}/health")
        if health_response.status_code == 200:
            print("Server is running!")
            print("-" * 50)
            
            example_bell_state()
            example_ghz_state()
            example_qft_4qubits()
        else:
            print("Server is not responding. Please start the server first.")
    except requests.exceptions.ConnectionError:
        print("Could not connect to server. Please start the server with: python main.py")

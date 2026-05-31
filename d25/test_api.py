import asyncio
import json
from main import app
from fastapi.testclient import TestClient

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"
    print("✓ Health check passed")

def test_simulation_endpoint():
    circuit_data = {
        "num_qubits": 2,
        "gates": [
            {"name": "H", "qubits": [0]},
            {"name": "CNOT", "qubits": [0, 1]}
        ]
    }
    
    response = client.post("/simulate", json=circuit_data)
    assert response.status_code == 200
    result = response.json()
    assert "task_id" in result
    assert result["status"] == "pending"
    print("✓ Simulation endpoint returned task_id")
    
    task_id = result["task_id"]
    
    import time
    time.sleep(1)
    
    status_response = client.get(f"/status/{task_id}")
    assert status_response.status_code == 200
    status_result = status_response.json()
    assert status_result["task_id"] == task_id
    
    if status_result["status"] == "completed":
        assert "probabilities" in status_result
        probs = status_result["probabilities"]
        assert len(probs) > 0
        print(f"✓ Task completed with probabilities: {probs}")
    elif status_result["status"] == "failed":
        print(f"✗ Task failed with error: {status_result.get('error')}")
    else:
        print(f"✓ Task status: {status_result['status']}")
    
    return status_result

def test_invalid_circuit():
    invalid_circuit = {
        "num_qubits": 11,
        "gates": []
    }
    
    response = client.post("/simulate", json=invalid_circuit)
    assert response.status_code == 422
    print("✓ Invalid circuit (too many qubits) rejected correctly")

def test_unknown_gate():
    circuit_data = {
        "num_qubits": 2,
        "gates": [
            {"name": "UNKNOWN_GATE", "qubits": [0]}
        ]
    }
    
    response = client.post("/simulate", json=circuit_data)
    assert response.status_code == 400
    print("✓ Unknown gate rejected correctly")

if __name__ == "__main__":
    print("Running Quantum Simulator API Tests...\n")
    
    test_health_check()
    print()
    
    test_invalid_circuit()
    print()
    
    test_unknown_gate()
    print()
    
    result = test_simulation_endpoint()
    print()
    
    print("All tests completed!")

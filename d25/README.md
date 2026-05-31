# Quantum Circuit Simulator API

A pure backend API for simulating quantum circuits with up to 10 qubits. Uses NumPy and SciPy for quantum state vector simulation.

## Features

- Support for up to 10 qubits
- Common quantum gates: H, X, Y, Z, S, T, CNOT, SWAP, TOFFOLI
- Noise models: Bit flip, Depolarizing
- Asynchronous task queue for long-running simulations
- REST API endpoints for circuit submission and status查询
- Returns measurement probability distribution and counts

## Project Structure

```
.
├── main.py              # FastAPI main application
├── gates.py             # Quantum gate matrices and operations
├── compiler.py          # Circuit compiler (JSON to operations)
├── simulator.py         # Quantum state vector simulator
├── noise.py             # Noise models (bit flip, depolarizing)
├── task_queue.py        # Asynchronous task queue management
├── requirements.txt     # Python dependencies
├── test_api.py          # API tests
├── test_noise.py        # Noise model tests
├── demo_noise.py        # Noise model demonstration
└── example_usage.py     # Example usage scripts
```

## Installation

1. Install dependencies:
```bash
pip install -r requirements.txt
```

## Running the Server

```bash
python main.py
```

The server will start at `http://localhost:8000`

## API Endpoints

### POST /simulate

Submit a quantum circuit for simulation with optional noise.

**Request Body (Ideal simulation):**
```json
{
  "num_qubits": 2,
  "gates": [
    {"name": "H", "qubits": [0]},
    {"name": "CNOT", "qubits": [0, 1]}
  ],
  "shots": 1024
}
```

**Request Body (With noise):**
```json
{
  "num_qubits": 2,
  "gates": [
    {"name": "H", "qubits": [0]},
    {"name": "CNOT", "qubits": [0, 1]}
  ],
  "noise": {
    "type": "depolarizing",
    "probability": 0.05,
    "apply_after_gates": true
  },
  "shots": 2048
}
```

**Response:**
```json
{
  "task_id": "uuid-string",
  "status": "pending",
  "message": "Simulation task submitted successfully"
}
```

### GET /status/{task_id}

Get the status and results of a simulation task.

**Response (Completed):**
```json
{
  "task_id": "uuid-string",
  "status": "completed",
  "created_at": "2024-...",
  "started_at": "2024-...",
  "completed_at": "2024-...",
  "num_qubits": 2,
  "probabilities": [
    {"state": "00", "probability": 0.5},
    {"state": "11", "probability": 0.5}
  ],
  "counts": [
    {"state": "00", "count": 512},
    {"state": "11", "count": 512}
  ],
  "shots": 1024,
  "noise": {
    "type": "depolarizing",
    "probability": 0.05,
    "apply_after_gates": true
  },
  "error": null
}
```

### GET /noise/types

Get available noise types.

### GET /health

Health check endpoint.

## Noise Models

| Noise Type | Description | Typical Probability |
|------------|-------------|---------------------|
| `none` | Ideal simulation - no noise | - |
| `bit_flip` | Randomly applies X gate on gate qubits | 0.001 - 0.1 |
| `depolarizing` | Randomly applies X/Y/Z gates on gate qubits | 0.001 - 0.1 |

## Supported Gates

| Gate | Qubits | Description |
|------|--------|-------------|
| H | 1 | Hadamard gate |
| X | 1 | Pauli-X gate |
| Y | 1 | Pauli-Y gate |
| Z | 1 | Pauli-Z gate |
| S | 1 | Phase gate |
| T | 1 | π/8 gate |
| CNOT | 2 | Controlled-NOT |
| SWAP | 2 | Swap gate |
| TOFFOLI | 3 | Toffoli (CCNOT) gate |

## Example Usage

```python
import requests
import time

# Create Bell state with noise
circuit = {
    "num_qubits": 2,
    "gates": [
        {"name": "H", "qubits": [0]},
        {"name": "CNOT", "qubits": [0, 1]}
    ],
    "noise": {
        "type": "bit_flip",
        "probability": 0.05
    },
    "shots": 2048
}

# Submit simulation
response = requests.post("http://localhost:8000/simulate", json=circuit)
task_id = response.json()["task_id"]

# Wait and check status
time.sleep(2)
status = requests.get(f"http://localhost:8000/status/{task_id}")
print(status.json())
```

## Testing

```bash
# Run noise model tests
python test_noise.py

# Run noise demo
python demo_noise.py

# Run basic simulator tests
python test_fixes.py
```

## API Documentation

Once the server is running, visit:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

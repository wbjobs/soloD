import asyncio
import numpy as np
from compiler import compile_circuit
from simulator import simulate_circuit

def test_noise_demo():
    print("=" * 60)
    print("Quantum Noise Model Demo")
    print("=" * 60)
    
    print("\nCircuit: X gate on qubit 0 (2 qubits)")
    print("Expected: |10> state with probability 1.0")
    print("=" * 60)
    
    shots = 5000
    
    p_values = [0.0, 0.05, 0.1, 0.2]
    
    for p in p_values:
        circuit = {
            "num_qubits": 2,
            "gates": [
                {"name": "X", "qubits": [0]}
            ],
            "noise": {
                "type": "bit_flip",
                "probability": p,
                "apply_after_gates": True
            }
        }
        
        compiled = compile_circuit(circuit)
        result = simulate_circuit(compiled, shots=shots)
        
        probs = result['probabilities']
        correct_prob = probs.get('10', 0)
        
        print(f"\np = {p:.2f}:")
        for state, prob in sorted(probs.items()):
            marker = " <- Correct" if state == '10' else ""
            print(f"  |{state}>: {prob:.4f}{marker}")
        print(f"  Fidelity (correct prob): {correct_prob:.4f}")
    
    print("\n" + "=" * 60)
    print("Expected: As p increases, fidelity decreases")
    print("=" * 60)

def test_depolarizing_fidelity():
    print("\n\n" + "=" * 60)
    print("Depolarizing Noise on GHZ State")
    print("=" * 60)
    
    shots = 5000
    p_values = [0.0, 0.02, 0.05, 0.1]
    
    for p in p_values:
        circuit = {
            "num_qubits": 3,
            "gates": [
                {"name": "H", "qubits": [0]},
                {"name": "CNOT", "qubits": [0, 1]},
                {"name": "CNOT", "qubits": [1, 2]}
            ],
            "noise": {
                "type": "depolarizing",
                "probability": p
            }
        }
        
        compiled = compile_circuit(circuit)
        result = simulate_circuit(compiled, shots=shots)
        
        probs = result['probabilities']
        ghz_fidelity = probs.get('000', 0) + probs.get('111', 0)
        
        print(f"\np = {p:.2f}:")
        for state, prob in sorted(probs.items()):
            marker = " <- GHZ" if state in ['000', '111'] else ""
            print(f"  |{state}>: {prob:.4f}{marker}")
        print(f"  GHZ state fidelity: {ghz_fidelity:.4f}")

def test_api_payload():
    print("\n\n" + "=" * 60)
    print("API Payload Example")
    print("=" * 60)
    
    payload = {
        "num_qubits": 2,
        "gates": [
            {"name": "H", "qubits": [0]},
            {"name": "CNOT", "qubits": [0, 1]}
        ],
        "noise": {
            "type": "depolarizing",
            "probability": 0.05,
            "apply_after_gates": True
        },
        "shots": 2048
    }
    
    print("POST /simulate payload:")
    import json
    print(json.dumps(payload, indent=2))
    
    print("\nResponse will include:")
    print("- counts: measurement counts for each state")
    print("- probabilities: normalized probabilities")
    print("- shots: number of measurements")
    print("- noise: noise configuration used")

async def main():
    np.random.seed(42)
    
    test_noise_demo()
    test_depolarizing_fidelity()
    test_api_payload()
    
    print("\n" + "=" * 60)
    print("All noise demonstrations completed!")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(main())

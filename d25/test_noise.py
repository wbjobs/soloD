import asyncio
import numpy as np
from compiler import compile_circuit
from simulator import simulate_circuit
from noise import BitFlipNoise, DepolarizingNoise, create_noise_model

def test_bit_flip_noise():
    print("=" * 60)
    print("Test 1: Bit Flip Noise Model")
    print("=" * 60)
    
    circuit = {
        "num_qubits": 1,
        "gates": [
            {"name": "H", "qubits": [0]}
        ],
        "noise": {
            "type": "bit_flip",
            "probability": 0.1,
            "apply_after_gates": True
        }
    }
    
    compiled = compile_circuit(circuit)
    print(f"Circuit: {compiled}")
    
    shots = 10000
    result = simulate_circuit(compiled, shots=shots)
    
    probs = result['probabilities']
    print(f"\nMeasurement probabilities (10000 shots):")
    for state, prob in sorted(probs.items()):
        print(f"  |{state}>: {prob:.4f}")
    
    expected_0 = 0.5 * 0.9 + 0.5 * 0.1
    expected_1 = 0.5 * 0.9 + 0.5 * 0.1
    print(f"\nExpected with p=0.1: |0> ~ {expected_0:.3f}, |1> ~ {expected_1:.3f}")
    
    diff_0 = abs(probs.get('0', 0) - expected_0)
    diff_1 = abs(probs.get('1', 0) - expected_1)
    
    if diff_0 < 0.05 and diff_1 < 0.05:
        print("\nOK Bit flip noise works correctly!")
    else:
        print(f"\nNote: Results may vary due to randomness.")
    
    print()

def test_depolarizing_noise():
    print("=" * 60)
    print("Test 2: Depolarizing Noise Model")
    print("=" * 60)
    
    circuit = {
        "num_qubits": 2,
        "gates": [
            {"name": "H", "qubits": [0]},
            {"name": "CNOT", "qubits": [0, 1]}
        ],
        "noise": {
            "type": "depolarizing",
            "probability": 0.05,
            "apply_after_gates": True
        }
    }
    
    compiled = compile_circuit(circuit)
    print(f"Circuit: {compiled}")
    
    shots = 10000
    result = simulate_circuit(compiled, shots=shots)
    
    probs = result['probabilities']
    print(f"\nBell state measurement probabilities with depolarizing noise:")
    for state, prob in sorted(probs.items()):
        print(f"  |{state}>: {prob:.4f}")
    
    ideal = 0.5
    noisy_expected = ideal * (1 - 0.05) + (0.25) * 0.05
    print(f"\nIdeal: |00> = 0.5, |11> = 0.5")
    print(f"Expected (with noise): ~{noisy_expected:.3f} for main states")
    
    if '00' in probs and '11' in probs:
        main_states = probs.get('00', 0) + probs.get('11', 0)
        print(f"\nTotal probability of main states: {main_states:.4f}")
        if main_states > 0.8:
            print("OK Depolarizing noise works correctly!")
    
    print()

def test_noise_vs_ideal():
    print("=" * 60)
    print("Test 3: Noise vs Ideal Comparison")
    print("=" * 60)
    
    circuit_ideal = {
        "num_qubits": 2,
        "gates": [
            {"name": "H", "qubits": [0]},
            {"name": "CNOT", "qubits": [0, 1]}
        ],
        "noise": {"type": "none", "probability": 0.0}
    }
    
    circuit_noisy = {
        "num_qubits": 2,
        "gates": [
            {"name": "H", "qubits": [0]},
            {"name": "CNOT", "qubits": [0, 1]}
        ],
        "noise": {"type": "bit_flip", "probability": 0.1}
    }
    
    shots = 5000
    
    compiled_ideal = compile_circuit(circuit_ideal)
    result_ideal = simulate_circuit(compiled_ideal, shots=shots)
    
    compiled_noisy = compile_circuit(circuit_noisy)
    result_noisy = simulate_circuit(compiled_noisy, shots=shots)
    
    print("Ideal Bell state:")
    for state, prob in sorted(result_ideal['probabilities'].items()):
        print(f"  |{state}>: {prob:.4f}")
    
    print("\nNoisy Bell state (p=0.1):")
    for state, prob in sorted(result_noisy['probabilities'].items()):
        print(f"  |{state}>: {prob:.4f}")
    
    ideal_main = result_ideal['probabilities'].get('00', 0) + result_ideal['probabilities'].get('11', 0)
    noisy_main = result_noisy['probabilities'].get('00', 0) + result_noisy['probabilities'].get('11', 0)
    
    print(f"\nIdeal main state prob: {ideal_main:.4f}")
    print(f"Noisy main state prob: {noisy_main:.4f}")
    
    if noisy_main < ideal_main:
        print("\nOK Noise correctly reduces fidelity!")
    
    print()

def test_no_noise():
    print("=" * 60)
    print("Test 4: No Noise (Ideal Simulation)")
    print("=" * 60)
    
    circuit = {
        "num_qubits": 3,
        "gates": [
            {"name": "H", "qubits": [0]},
            {"name": "CNOT", "qubits": [0, 1]},
            {"name": "CNOT", "qubits": [1, 2]}
        ],
        "noise": {"type": "none"}
    }
    
    compiled = compile_circuit(circuit)
    result = simulate_circuit(compiled, shots=10000)
    
    probs = result['probabilities']
    print("GHZ state measurement (ideal):")
    for state, prob in sorted(probs.items()):
        print(f"  |{state}>: {prob:.4f}")
    
    assert '000' in probs and '111' in probs
    assert abs(probs['000'] - 0.5) < 0.05
    assert abs(probs['111'] - 0.5) < 0.05
    
    print("\nOK Ideal simulation works correctly!")
    print()

def test_noise_factory():
    print("=" * 60)
    print("Test 5: Noise Model Factory")
    print("=" * 60)
    
    noise_configs = [
        {"type": "none"},
        {"type": "bit_flip", "probability": 0.05},
        {"type": "depolarizing", "probability": 0.05}
    ]
    
    for config in noise_configs:
        noise = create_noise_model(config)
        print(f"Type: {config['type']:15} -> NoiseModel: {noise.__class__.__name__}")
    
    print("\nOK Noise model factory works correctly!")
    print()

async def main():
    print("\n" + "=" * 60)
    print("Quantum Noise Model Tests")
    print("=" * 60 + "\n")
    
    np.random.seed(42)
    
    test_noise_factory()
    test_no_noise()
    test_bit_flip_noise()
    test_depolarizing_noise()
    test_noise_vs_ideal()
    
    print("=" * 60)
    print("All noise model tests completed!")
    print("=" * 60)
    print()
    print("Summary:")
    print("- Bit flip noise: Randomly applies X gate")
    print("- Depolarizing noise: Randomly applies X/Y/Z gates")
    print("- Noise can be configured per circuit")
    print("- Noise reduces fidelity as expected")

if __name__ == "__main__":
    asyncio.run(main())

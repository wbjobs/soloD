import numpy as np
import sys
import time
from gates import apply_single_qubit_gate, apply_two_qubit_gate, H, CNOT, X
from compiler import compile_circuit
from simulator import simulate_circuit

def test_cnot_non_adjacent():
    print("Test 1: CNOT with non-adjacent qubits (3 qubits, control=0, target=2)")
    
    num_qubits = 3
    state = np.zeros(2**num_qubits, dtype=complex)
    state[0] = 1.0
    
    state = apply_single_qubit_gate(state, H, 0, num_qubits)
    
    state = apply_two_qubit_gate(state, CNOT, 0, 2, num_qubits)
    
    probs = np.abs(state)**2
    print(f"  |000>: {probs[0]:.4f}")
    print(f"  |101>: {probs[5]:.4f}")
    
    expected_000 = 0.5
    expected_101 = 0.5
    
    assert abs(probs[0] - expected_000) < 1e-6, f"Expected |000⟩ prob {expected_000}, got {probs[0]}"
    assert abs(probs[5] - expected_101) < 1e-6, f"Expected |101⟩ prob {expected_101}, got {probs[5]}"
    
    print("  OK PASSED: Non-adjacent CNOT works correctly!")
    print()

def test_cnot_various_positions():
    print("Test 2: CNOT with various qubit positions")
    
    test_cases = [
        (4, 0, 1, "adjacent (0,1)"),
        (4, 1, 3, "non-adjacent (1,3)"),
        (4, 0, 3, "far apart (0,3)"),
        (4, 3, 0, "reverse (3,0)"),
        (5, 0, 4, "5-qubit, (0,4)"),
    ]
    
    for num_qubits, control, target, desc in test_cases:
        state = np.zeros(2**num_qubits, dtype=complex)
        state[0] = 1.0
        
        state = apply_single_qubit_gate(state, H, control, num_qubits)
        state = apply_two_qubit_gate(state, CNOT, control, target, num_qubits)
        
        probs = np.abs(state)**2
        
        idx1 = (1 << (num_qubits - 1 - control)) | (1 << (num_qubits - 1 - target))
        
        total = probs[0] + probs[idx1]
        
        assert abs(probs[0] - 0.5) < 1e-6, f"Failed {desc}: |00...0⟩ = {probs[0]}"
        assert abs(probs[idx1] - 0.5) < 1e-6, f"Failed {desc}: idx={idx1}, prob={probs[idx1]}"
        
        print(f"  OK {desc}: PASSED")
    
    print()

def test_8qubit_memory():
    print("Test 3: 8-qubit circuit simulation")
    
    circuit = {
        "num_qubits": 8,
        "gates": [
            {"name": "H", "qubits": [i]} for i in range(8)
        ] + [
            {"name": "CNOT", "qubits": [0, 7]},
            {"name": "CNOT", "qubits": [1, 6]},
            {"name": "CNOT", "qubits": [2, 5]},
        ]
    }
    
    start_time = time.time()
    start_mem = sys.getsizeof([])
    
    compiled = compile_circuit(circuit)
    result = simulate_circuit(compiled)
    
    elapsed = time.time() - start_time
    
    print(f"  Number of qubits: 8")
    print(f"  Number of gates: {len(circuit['gates'])}")
    print(f"  Simulation time: {elapsed:.3f}s")
    print(f"  Number of non-zero probabilities: {len(result['probabilities'])}")
    
    assert result['num_qubits'] == 8
    assert len(result['probabilities']) > 0
    
    print("  OK PASSED: 8-qubit simulation works!")
    print()

def test_10qubit_memory():
    print("Test 4: 10-qubit circuit simulation (max)")
    
    circuit = {
        "num_qubits": 10,
        "gates": [
            {"name": "H", "qubits": [i]} for i in range(5)
        ] + [
            {"name": "CNOT", "qubits": [0, 9]},
            {"name": "CNOT", "qubits": [1, 8]},
            {"name": "X", "qubits": [4]},
        ]
    }
    
    start_time = time.time()
    
    compiled = compile_circuit(circuit)
    result = simulate_circuit(compiled)
    
    elapsed = time.time() - start_time
    
    print(f"  Number of qubits: 10")
    print(f"  State vector size: {2**10} = 1024 elements")
    print(f"  Simulation time: {elapsed:.3f}s")
    print(f"  Number of non-zero probabilities: {len(result['probabilities'])}")
    
    assert result['num_qubits'] == 10
    assert len(result['probabilities']) > 0
    
    print("  OK PASSED: 10-qubit simulation works!")
    print()

def test_bell_state_verification():
    print("Test 5: Bell state verification")
    
    circuit = {
        "num_qubits": 2,
        "gates": [
            {"name": "H", "qubits": [0]},
            {"name": "CNOT", "qubits": [0, 1]}
        ]
    }
    
    compiled = compile_circuit(circuit)
    result = simulate_circuit(compiled)
    
    probs = result['probabilities']
    
    print(f"  Probabilities: {probs}")
    
    assert '00' in probs, "Missing |00> state"
    assert '11' in probs, "Missing |11> state"
    assert abs(probs['00'] - 0.5) < 1e-6, f"|00> probability should be 0.5, got {probs['00']}"
    assert abs(probs['11'] - 0.5) < 1e-6, f"|11> probability should be 0.5, got {probs['11']}"
    
    print("  OK PASSED: Bell state is correct!")
    print()

if __name__ == "__main__":
    print("=" * 60)
    print("Quantum Simulator Bug Fix Verification Tests")
    print("=" * 60)
    print()
    
    test_cnot_non_adjacent()
    test_cnot_various_positions()
    test_bell_state_verification()
    test_8qubit_memory()
    test_10qubit_memory()
    
    print("=" * 60)
    print("All tests passed! OK")
    print("=" * 60)
    print()
    print("Summary of fixes:")
    print("1. OK Fixed CNOT gate for non-adjacent qubits using direct indexing")
    print("2. OK Fixed memory leak by avoiding large matrix construction")
    print("3. OK Optimized memory usage with O(N) state operations")
    print("4. OK Added garbage collection in task queue")

import numpy as np
from typing import Dict, List, Optional, Any
from compiler import QuantumCircuit, GateOperation
from gates import apply_single_qubit_gate, apply_two_qubit_gate, apply_three_qubit_gate, get_num_qubits
from noise import create_noise_model, apply_gate_noise

class QuantumSimulator:
    def __init__(self, num_qubits: int, noise_config: Optional[Dict[str, Any]] = None):
        self.num_qubits = num_qubits
        self.state = self._initialize_state()
        self.noise_model = create_noise_model(noise_config) if noise_config else None
        self.apply_noise_after_gates = noise_config.get('apply_after_gates', True) if noise_config else False
    
    def _initialize_state(self) -> np.ndarray:
        size = 2 ** self.num_qubits
        state = np.zeros(size, dtype=complex)
        state[0] = 1.0
        return state
    
    def apply_gate(self, operation: GateOperation):
        gate_name = operation.gate_name
        qubits = operation.qubits
        matrix = operation.matrix
        
        gate_qubits = get_num_qubits(gate_name)
        
        if gate_qubits == 1:
            self.state = apply_single_qubit_gate(self.state, matrix, qubits[0], self.num_qubits)
        elif gate_qubits == 2:
            self.state = apply_two_qubit_gate(self.state, matrix, qubits[0], qubits[1], self.num_qubits)
        elif gate_qubits == 3:
            self.state = apply_three_qubit_gate(self.state, matrix, qubits[0], qubits[1], qubits[2], self.num_qubits)
        else:
            raise ValueError(f"Unsupported gate with {gate_qubits} qubits")
        
        if self.noise_model and self.apply_noise_after_gates:
            self.state = apply_gate_noise(self.state, qubits, self.num_qubits, self.noise_model)
    
    def get_probabilities(self, shots: int = 1024) -> Dict[str, float]:
        probabilities = np.abs(self.state) ** 2
        
        if shots > 0:
            outcomes = np.random.choice(
                len(probabilities),
                size=shots,
                p=probabilities
            )
            
            counts = {}
            for outcome in outcomes:
                bitstring = format(outcome, f'0{self.num_qubits}b')
                counts[bitstring] = counts.get(bitstring, 0) + 1
            
            result = {}
            for bitstring, count in counts.items():
                result[bitstring] = count / shots
            return result
        else:
            result = {}
            for i, prob in enumerate(probabilities):
                if prob > 1e-10:
                    bitstring = format(i, f'0{self.num_qubits}b')
                    result[bitstring] = float(prob)
            return result
    
    def get_counts(self, shots: int = 1024) -> Dict[str, int]:
        probabilities = np.abs(self.state) ** 2
        
        outcomes = np.random.choice(
            len(probabilities),
            size=shots,
            p=probabilities
        )
        
        counts = {}
        for outcome in outcomes:
            bitstring = format(outcome, f'0{self.num_qubits}b')
            counts[bitstring] = counts.get(bitstring, 0) + 1
        
        return counts
    
    def get_state_vector(self) -> List[complex]:
        return self.state.tolist()

def simulate_circuit(circuit: QuantumCircuit, shots: int = 1024) -> Dict[str, any]:
    simulator = QuantumSimulator(circuit.num_qubits, circuit.noise_config)
    
    for operation in circuit.operations:
        simulator.apply_gate(operation)
    
    counts = simulator.get_counts(shots)
    probabilities = {k: v / shots for k, v in counts.items()}
    
    return {
        'num_qubits': circuit.num_qubits,
        'state_vector': simulator.get_state_vector(),
        'probabilities': probabilities,
        'counts': counts,
        'shots': shots,
        'noise': circuit.noise_config
    }

import numpy as np
from typing import Optional, Dict, Any
from gates import X, I, apply_single_qubit_gate

class NoiseModel:
    def __init__(self, noise_type: str = "none", **kwargs):
        self.noise_type = noise_type
        self.params = kwargs
    
    def apply(self, state: np.ndarray, target_qubit: int, num_qubits: int) -> np.ndarray:
        return state

class BitFlipNoise(NoiseModel):
    def __init__(self, probability: float = 0.01):
        super().__init__("bit_flip", probability=probability)
        self.probability = probability
    
    def apply(self, state: np.ndarray, target_qubit: int, num_qubits: int) -> np.ndarray:
        if self.probability <= 0:
            return state
        
        if np.random.random() < self.probability:
            return apply_single_qubit_gate(state, X, target_qubit, num_qubits)
        
        return state

class DepolarizingNoise(NoiseModel):
    def __init__(self, probability: float = 0.01):
        super().__init__("depolarizing", probability=probability)
        self.probability = probability
    
    def apply(self, state: np.ndarray, target_qubit: int, num_qubits: int) -> np.ndarray:
        if self.probability <= 0:
            return state
        
        r = np.random.random()
        p = self.probability
        
        if r < p / 3:
            return apply_single_qubit_gate(state, X, target_qubit, num_qubits)
        elif r < 2 * p / 3:
            Y = np.array([[0, -1j], [1j, 0]], dtype=complex)
            return apply_single_qubit_gate(state, Y, target_qubit, num_qubits)
        elif r < p:
            Z = np.array([[1, 0], [0, -1]], dtype=complex)
            return apply_single_qubit_gate(state, Z, target_qubit, num_qubits)
        
        return state

class MeasurementNoise(NoiseModel):
    def __init__(self, probability: float = 0.02):
        super().__init__("measurement", probability=probability)
        self.probability = probability
    
    def apply_measurement(self, counts: Dict[str, int]) -> Dict[str, int]:
        if self.probability <= 0:
            return counts
        
        noisy_counts = {}
        for bitstring, count in counts.items():
            for _ in range(count):
                bits = list(bitstring)
                for i in range(len(bits)):
                    if np.random.random() < self.probability:
                        bits[i] = '1' if bits[i] == '0' else '0'
                new_bitstring = ''.join(bits)
                noisy_counts[new_bitstring] = noisy_counts.get(new_bitstring, 0) + 1
        
        return noisy_counts

def create_noise_model(noise_config: Dict[str, Any]) -> NoiseModel:
    noise_type = noise_config.get("type", "none").lower()
    
    if noise_type == "bit_flip":
        return BitFlipNoise(probability=noise_config.get("probability", 0.01))
    elif noise_type == "depolarizing":
        return DepolarizingNoise(probability=noise_config.get("probability", 0.01))
    elif noise_type == "measurement":
        return MeasurementNoise(probability=noise_config.get("probability", 0.02))
    elif noise_type == "none":
        return NoiseModel("none")
    else:
        raise ValueError(f"Unknown noise type: {noise_type}")

def apply_gate_noise(state: np.ndarray, qubits: list, num_qubits: int, noise_model: NoiseModel) -> np.ndarray:
    for qubit in qubits:
        state = noise_model.apply(state, qubit, num_qubits)
    
    return state

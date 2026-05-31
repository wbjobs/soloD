from typing import List, Dict, Any, Optional
from gates import get_gate_matrix, is_single_qubit_gate, get_num_qubits

class GateOperation:
    def __init__(self, gate_name: str, qubits: List[int], params: Dict[str, Any] = None):
        self.gate_name = gate_name
        self.qubits = qubits
        self.params = params or {}
        self.matrix = get_gate_matrix(gate_name)
    
    def __repr__(self):
        return f"GateOperation({self.gate_name}, qubits={self.qubits})"

class QuantumCircuit:
    def __init__(self, num_qubits: int):
        if num_qubits < 1 or num_qubits > 10:
            raise ValueError(f"Number of qubits must be between 1 and 10, got {num_qubits}")
        self.num_qubits = num_qubits
        self.operations: List[GateOperation] = []
        self.noise_config: Dict[str, Any] = {}
    
    def add_gate(self, gate_name: str, qubits: List[int], params: Dict[str, Any] = None):
        for qubit in qubits:
            if qubit < 0 or qubit >= self.num_qubits:
                raise ValueError(f"Qubit index {qubit} out of range for {self.num_qubits}-qubit circuit")
        
        gate_qubits = get_num_qubits(gate_name)
        if len(qubits) != gate_qubits:
            raise ValueError(f"Gate {gate_name} requires {gate_qubits} qubits, got {len(qubits)}")
        
        operation = GateOperation(gate_name, qubits, params)
        self.operations.append(operation)
    
    def set_noise(self, noise_type: str, probability: float, apply_after_gates: bool = True):
        self.noise_config = {
            "type": noise_type,
            "probability": probability,
            "apply_after_gates": apply_after_gates
        }
    
    def __repr__(self):
        return f"QuantumCircuit({self.num_qubits} qubits, {len(self.operations)} operations, noise={self.noise_config.get('type', 'none')})"

def compile_circuit(circuit_json: Dict[str, Any]) -> QuantumCircuit:
    num_qubits = circuit_json.get('num_qubits')
    if num_qubits is None:
        raise ValueError("Circuit JSON must contain 'num_qubits' field")
    
    circuit = QuantumCircuit(num_qubits)
    
    noise_config = circuit_json.get('noise', None)
    if noise_config:
        circuit.set_noise(
            noise_type=noise_config.get('type', 'none'),
            probability=noise_config.get('probability', 0.0),
            apply_after_gates=noise_config.get('apply_after_gates', True)
        )
    
    gates = circuit_json.get('gates', [])
    for gate_info in gates:
        gate_name = gate_info.get('name')
        if not gate_name:
            raise ValueError("Each gate must have a 'name' field")
        
        qubits = gate_info.get('qubits', [])
        if not isinstance(qubits, list):
            raise ValueError("Gate 'qubits' must be a list")
        
        params = gate_info.get('params', {})
        circuit.add_gate(gate_name, qubits, params)
    
    return circuit

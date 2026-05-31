import numpy as np
from scipy.linalg import kron

I = np.array([[1, 0], [0, 1]], dtype=complex)
X = np.array([[0, 1], [1, 0]], dtype=complex)
Y = np.array([[0, -1j], [1j, 0]], dtype=complex)
Z = np.array([[1, 0], [0, -1]], dtype=complex)
H = np.array([[1, 1], [1, -1]], dtype=complex) / np.sqrt(2)
S = np.array([[1, 0], [0, 1j]], dtype=complex)
T = np.array([[1, 0], [0, np.exp(1j * np.pi / 4)]], dtype=complex)

CNOT = np.array([
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 0, 1],
    [0, 0, 1, 0]
], dtype=complex)

SWAP = np.array([
    [1, 0, 0, 0],
    [0, 0, 1, 0],
    [0, 1, 0, 0],
    [0, 0, 0, 1]
], dtype=complex)

TOFFOLI = np.eye(8, dtype=complex)
TOFFOLI[6, 6] = 0
TOFFOLI[7, 7] = 0
TOFFOLI[6, 7] = 1
TOFFOLI[7, 6] = 1

GATE_MATRICES = {
    'I': I,
    'X': X,
    'Y': Y,
    'Z': Z,
    'H': H,
    'S': S,
    'T': T,
    'CNOT': CNOT,
    'SWAP': SWAP,
    'TOFFOLI': TOFFOLI
}

def get_gate_matrix(gate_name: str) -> np.ndarray:
    gate_name_upper = gate_name.upper()
    if gate_name_upper not in GATE_MATRICES:
        raise ValueError(f"Unknown gate: {gate_name}")
    return GATE_MATRICES[gate_name_upper].copy()

def is_single_qubit_gate(gate_name: str) -> bool:
    gate_name_upper = gate_name.upper()
    if gate_name_upper not in GATE_MATRICES:
        raise ValueError(f"Unknown gate: {gate_name}")
    return GATE_MATRICES[gate_name_upper].shape == (2, 2)

def get_num_qubits(gate_name: str) -> int:
    gate_name_upper = gate_name.upper()
    if gate_name_upper not in GATE_MATRICES:
        raise ValueError(f"Unknown gate: {gate_name}")
    return int(np.log2(GATE_MATRICES[gate_name_upper].shape[0]))

def apply_single_qubit_gate(state: np.ndarray, gate: np.ndarray, target_qubit: int, num_qubits: int) -> np.ndarray:
    new_state = np.zeros_like(state)
    target_mask = 1 << (num_qubits - 1 - target_qubit)
    
    for i in range(len(state)):
        if (i & target_mask) == 0:
            j = i | target_mask
            new_state[i] += gate[0, 0] * state[i]
            new_state[j] += gate[1, 0] * state[i]
        else:
            j = i & ~target_mask
            new_state[i] += gate[1, 1] * state[i]
            new_state[j] += gate[0, 1] * state[i]
    
    return new_state

def apply_two_qubit_gate(state: np.ndarray, gate: np.ndarray, qubit_a: int, qubit_b: int, num_qubits: int) -> np.ndarray:
    new_state = np.zeros_like(state)
    
    bit_a = num_qubits - 1 - qubit_a
    bit_b = num_qubits - 1 - qubit_b
    
    mask_a = 1 << bit_a
    mask_b = 1 << bit_b
    
    for i in range(len(state)):
        a = (i >> bit_a) & 1
        b = (i >> bit_b) & 1
        
        row = a * 2 + b
        
        base = i & ~mask_a & ~mask_b
        
        for new_a in [0, 1]:
            for new_b in [0, 1]:
                col = new_a * 2 + new_b
                j = base | (new_a << bit_a) | (new_b << bit_b)
                new_state[j] += gate[row, col] * state[i]
    
    return new_state

def apply_three_qubit_gate(state: np.ndarray, gate: np.ndarray, qubit_a: int, qubit_b: int, qubit_c: int, num_qubits: int) -> np.ndarray:
    new_state = np.zeros_like(state)
    
    bit_a = num_qubits - 1 - qubit_a
    bit_b = num_qubits - 1 - qubit_b
    bit_c = num_qubits - 1 - qubit_c
    
    mask_a = 1 << bit_a
    mask_b = 1 << bit_b
    mask_c = 1 << bit_c
    
    for i in range(len(state)):
        a = (i >> bit_a) & 1
        b = (i >> bit_b) & 1
        c = (i >> bit_c) & 1
        
        row = a * 4 + b * 2 + c
        
        base = i & ~mask_a & ~mask_b & ~mask_c
        
        for new_a in [0, 1]:
            for new_b in [0, 1]:
                for new_c in [0, 1]:
                    col = new_a * 4 + new_b * 2 + new_c
                    j = base | (new_a << bit_a) | (new_b << bit_b) | (new_c << bit_c)
                    new_state[j] += gate[row, col] * state[i]
    
    return new_state

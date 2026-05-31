from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from Bio.PDB import PDBParser, Selection
import numpy as np
import os
import tempfile
from werkzeug.utils import secure_filename
import time
import json
import threading
from queue import Queue
import uuid

app = Flask(__name__)
CORS(app, supports_credentials=True)

UPLOAD_FOLDER = tempfile.mkdtemp()
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 200 * 1024 * 1024
app.config['TIMEOUT'] = 300

MAX_ATOMS_FOR_FULL_RENDER = 50000
MAX_RESIDUES_FOR_FULL_RENDER = 10000

simulation_sessions = {}
simulation_lock = threading.Lock()

class MolecularDynamicsEngine:
    def __init__(self, atoms, residues, temperature=300.0):
        self.atoms = atoms
        self.residues = residues
        self.temperature = temperature
        self.velocities = self._initialize_velocities()
        self.running = False
        self.time_step = 0.001  # ps
        self.friction = 0.1  # Langevin friction coefficient
        self.kT = temperature * 1.380649e-23  # Boltzmann constant
        self.scale = 0.01  # Position scaling for visualization
        
    def _initialize_velocities(self):
        np.random.seed(42)
        n = len(self.atoms)
        velocities = np.random.randn(n, 3)
        avg_vel = np.mean(velocities, axis=0)
        velocities -= avg_vel
        # Scale velocities to match temperature (simplified)
        temp_factor = np.sqrt(self.temperature / 300.0)
        return velocities * temp_factor * self.scale
    
    def set_temperature(self, temp):
        self.temperature = temp
        self.kT = temp * 1.380649e-23
        # Rescale velocities
        current_temp = np.sum(np.sum(self.velocities**2))
        target_temp = temp / 300.0
        scale = np.sqrt(target_temp / max(current_temp, 1e-10))
        self.velocities *= scale
    
    def _compute_forces(self, positions):
        n = len(positions)
        forces = np.zeros((n, 3))
        
        # Simplified forces: harmonic bonds + weak repulsion
        for i in range(n):
            for j in range(i+1, min(i+10, n)):
                dr = positions[j] - positions[i]
                dist = np.linalg.norm(dr)
                if dist < 1e-6:
                    continue
                
                # Harmonic bond for nearby atoms (simplified backbone)
                if j == i + 1:
                    rest_length = 1.5 * self.scale
                    force_mag = 0.5 * (dist - rest_length)
                    forces[i] += (dr / dist) * force_mag
                    forces[j] -= (dr / dist) * force_mag
                
                # Weak repulsive force
                if dist < 3 * self.scale:
                    repulsion = 0.01 / (dist * dist)
                    forces[i] += (dr / dist) * repulsion
                    forces[j] -= (dr / dist) * repulsion
        
        return forces
    
    def step(self):
        n = len(self.atoms)
        positions = np.array([[a['x'] * self.scale, a['y'] * self.scale, a['z'] * self.scale] for a in self.atoms])
        
        # Compute forces
        forces = self._compute_forces(positions)
        
        # Langevin dynamics update
        random_forces = np.random.randn(n, 3) * np.sqrt(2 * self.friction * self.kT / self.time_step) * 1e10
        self.velocities += (forces + random_forces) * self.time_step
        self.velocities *= (1 - self.friction * self.time_step)
        positions += self.velocities * self.time_step
        
        # Update atom positions
        for i in range(n):
            self.atoms[i]['x'] = positions[i][0] / self.scale
            self.atoms[i]['y'] = positions[i][1] / self.scale
            self.atoms[i]['z'] = positions[i][2] / self.scale
        
        return self.atoms
    
    def get_simplified_state(self):
        # Return only every Nth atom for transmission efficiency
        sample_rate = max(1, len(self.atoms) // 500)
        simplified = [
            {'idx': i, 'x': round(a['x'], 3), 'y': round(a['y'], 3), 'z': round(a['z'], 3)}
            for i, a in enumerate(self.atoms[::sample_rate])
        ]
        return {
            'step': self.current_step if hasattr(self, 'current_step') else 0,
            'atoms': simplified,
            'total_atoms': len(self.atoms),
            'sample_rate': sample_rate,
            'temperature': self.temperature
        }

def run_simulation(session_id, stop_event):
    session = simulation_sessions[session_id]
    engine = session['engine']
    engine.running = True
    step = 0
    
    while not stop_event.is_set() and engine.running:
        step += 1
        engine.current_step = step
        engine.step()
        
        # Send update every few steps for performance
        if step % 3 == 0:
            state = engine.get_simplified_state()
            session['queue'].put(state)
        
        time.sleep(0.03)  # ~30 FPS
    
    engine.running = False

def get_hydrophobicity(residue_name):
    hydrophobicity_scale = {
        'ALA': 1.8, 'ARG': -4.5, 'ASN': -3.5, 'ASP': -3.5, 'CYS': 2.5,
        'GLN': -3.5, 'GLU': -3.5, 'GLY': -0.4, 'HIS': -3.2, 'ILE': 4.5,
        'LEU': 3.8, 'LYS': -3.9, 'MET': 1.9, 'PHE': 2.8, 'PRO': -1.6,
        'SER': -0.8, 'THR': -0.7, 'TRP': -0.9, 'TYR': -1.3, 'VAL': 4.2
    }
    return hydrophobicity_scale.get(residue_name, 0)

def get_electrostatic_charge(residue_name):
    charge_scale = {
        'ARG': 1.0, 'LYS': 1.0, 'HIS': 0.5,
        'ASP': -1.0, 'GLU': -1.0,
        'ALA': 0, 'ASN': 0, 'CYS': 0, 'GLN': 0, 'GLY': 0,
        'ILE': 0, 'LEU': 0, 'MET': 0, 'PHE': 0, 'PRO': 0,
        'SER': 0, 'THR': 0, 'TRP': 0, 'TYR': 0, 'VAL': 0
    }
    return charge_scale.get(residue_name, 0)

def smart_sample_atoms(atoms, max_atoms=MAX_ATOMS_FOR_FULL_RENDER):
    if len(atoms) <= max_atoms:
        return atoms, False
    
    backbone_atoms = []
    sidechain_atoms = []
    
    for atom in atoms:
        name = atom['name']
        if name in ['CA', 'C', 'N', 'O', 'CB']:
            backbone_atoms.append(atom)
        else:
            sidechain_atoms.append(atom)
    
    if len(backbone_atoms) >= max_atoms:
        step = len(backbone_atoms) // max_atoms
        sampled = backbone_atoms[::step]
        return sampled[:max_atoms], True
    
    remaining = max_atoms - len(backbone_atoms)
    if len(sidechain_atoms) > remaining:
        step = len(sidechain_atoms) // remaining
        sampled_sidechain = sidechain_atoms[::step]
    else:
        sampled_sidechain = sidechain_atoms
    
    return backbone_atoms + sampled_sidechain, True

def get_backbone_only(residues, atoms):
    backbone_atoms = []
    for atom in atoms:
        if atom['name'] in ['CA', 'C', 'N', 'O']:
            backbone_atoms.append(atom)
    return backbone_atoms

@app.route('/api/upload', methods=['POST'])
def upload_file():
    start_time = time.time()
    
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if file and file.filename.endswith('.pdb'):
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        file_size = os.path.getsize(filepath) / (1024 * 1024)
        
        try:
            parser = PDBParser(QUIET=True)
            structure = parser.get_structure('protein', filepath)
            
            atoms = []
            residues = []
            atom_count = 0
            residue_count = 0
            
            model = next(structure.get_models(), None)
            if model:
                for chain in model:
                    for residue in chain:
                        if residue.get_id()[0] == ' ':
                            res_name = residue.get_resname()
                            hydrophobicity = get_hydrophobicity(res_name)
                            charge = get_electrostatic_charge(res_name)
                            
                            residues.append({
                                'id': residue.get_id()[1],
                                'name': res_name,
                                'chain': chain.get_id(),
                                'hydrophobicity': hydrophobicity,
                                'charge': charge
                            })
                            residue_count += 1
                            
                            for atom in residue:
                                coord = atom.get_coord()
                                atoms.append({
                                    'name': atom.get_name(),
                                    'element': atom.element,
                                    'x': float(coord[0]),
                                    'y': float(coord[1]),
                                    'z': float(coord[2]),
                                    'residue_id': residue.get_id()[1],
                                    'residue_name': res_name
                                })
                                atom_count += 1
            
            os.remove(filepath)
            
            sampled_atoms, was_sampled = smart_sample_atoms(atoms)
            backbone_atoms = get_backbone_only(residues, atoms)
            
            processing_time = time.time() - start_time
            
            return jsonify({
                'success': True,
                'atoms': sampled_atoms,
                'atoms_full': atoms if len(atoms) <= 100000 else None,
                'atoms_backbone': backbone_atoms,
                'residues': residues,
                'filename': filename,
                'stats': {
                    'total_atoms': atom_count,
                    'total_residues': residue_count,
                    'file_size_mb': round(file_size, 2),
                    'was_sampled': was_sampled,
                    'rendered_atoms': len(sampled_atoms),
                    'processing_time': round(processing_time, 2)
                }
            })
            
        except Exception as e:
            if os.path.exists(filepath):
                os.remove(filepath)
            return jsonify({'error': str(e)}), 500
    
    return jsonify({'error': 'Invalid file type. Please upload a .pdb file'}), 400

@app.route('/api/analyze', methods=['POST'])
def analyze_protein():
    data = request.json
    if not data or 'atoms' not in data:
        return jsonify({'error': 'No atom data provided'}), 400
    
    atoms = data['atoms']
    residues = data.get('residues', [])
    
    hydrophobicity_values = [r['hydrophobicity'] for r in residues]
    charge_values = [r['charge'] for r in residues]
    
    analysis = {
        'hydrophobicity': {
            'min': float(min(hydrophobicity_values)) if hydrophobicity_values else 0,
            'max': float(max(hydrophobicity_values)) if hydrophobicity_values else 0,
            'avg': float(np.mean(hydrophobicity_values)) if hydrophobicity_values else 0,
            'values': hydrophobicity_values
        },
        'electrostatic': {
            'min': float(min(charge_values)) if charge_values else 0,
            'max': float(max(charge_values)) if charge_values else 0,
            'avg': float(np.mean(charge_values)) if charge_values else 0,
            'values': charge_values
        },
        'total_atoms': len(atoms),
        'total_residues': len(residues)
    }
    
    return jsonify({
        'success': True,
        'analysis': analysis
    })

@app.errorhandler(413)
def request_entity_too_large(error):
    return jsonify({'error': 'File too large. Maximum allowed size is 200MB.'}), 413

@app.route('/api/simulation/start', methods=['POST'])
def start_simulation():
    data = request.json
    if not data or 'atoms' not in data or 'residues' not in data:
        return jsonify({'error': 'Missing atoms or residues data'}), 400
    
    session_id = str(uuid.uuid4())
    temperature = data.get('temperature', 300.0)
    
    engine = MolecularDynamicsEngine(
        data['atoms'].copy(),
        data['residues'],
        temperature
    )
    
    stop_event = threading.Event()
    queue = Queue(maxsize=100)
    
    with simulation_lock:
        simulation_sessions[session_id] = {
            'engine': engine,
            'queue': queue,
            'stop_event': stop_event,
            'thread': None
        }
    
    thread = threading.Thread(target=run_simulation, args=(session_id, stop_event))
    thread.daemon = True
    thread.start()
    
    with simulation_lock:
        simulation_sessions[session_id]['thread'] = thread
    
    return jsonify({
        'success': True,
        'session_id': session_id,
        'temperature': temperature
    })

@app.route('/api/simulation/stream/<session_id>')
def stream_simulation(session_id):
    with simulation_lock:
        session = simulation_sessions.get(session_id)
    
    if not session:
        return jsonify({'error': 'Session not found'}), 404
    
    def generate():
        try:
            while True:
                try:
                    state = session['queue'].get(timeout=5)
                    yield f"data: {json.dumps(state)}\n\n"
                except:
                    # Send heartbeat
                    yield f"data: {json.dumps({'heartbeat': True})}\n\n"
        except GeneratorExit:
            pass
    
    return Response(
        generate(),
        mimetype='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        }
    )

@app.route('/api/simulation/stop/<session_id>', methods=['POST'])
def stop_simulation(session_id):
    with simulation_lock:
        session = simulation_sessions.get(session_id)
    
    if not session:
        return jsonify({'error': 'Session not found'}), 404
    
    session['stop_event'].set()
    session['engine'].running = False
    
    # Cleanup
    time.sleep(0.5)
    with simulation_lock:
        if session_id in simulation_sessions:
            del simulation_sessions[session_id]
    
    return jsonify({'success': True})

@app.route('/api/simulation/temperature/<session_id>', methods=['POST'])
def update_temperature(session_id):
    with simulation_lock:
        session = simulation_sessions.get(session_id)
    
    if not session:
        return jsonify({'error': 'Session not found'}), 404
    
    data = request.json
    temperature = data.get('temperature', 300.0)
    session['engine'].set_temperature(temperature)
    
    return jsonify({
        'success': True,
        'temperature': temperature
    })

@app.route('/api/simulation/reset/<session_id>', methods=['POST'])
def reset_simulation(session_id):
    with simulation_lock:
        session = simulation_sessions.get(session_id)
    
    if not session:
        return jsonify({'error': 'Session not found'}), 404
    
    data = request.json
    temperature = data.get('temperature', 300.0)
    
    # Re-initialize engine
    session['engine'].temperature = temperature
    session['engine'].velocities = session['engine']._initialize_velocities()
    
    return jsonify({
        'success': True,
        'temperature': temperature
    })

if __name__ == '__main__':
    from werkzeug.serving import run_simple
    run_simple('localhost', 5000, app, 
               threaded=True, 
               processes=1,
               use_reloader=True,
               use_debugger=True)

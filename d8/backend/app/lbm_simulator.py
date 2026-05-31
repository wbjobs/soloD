import numpy as np
from typing import Tuple, Optional, Dict, List


class LatticeBoltzmann:
    def __init__(
        self,
        nx: int = 200,
        ny: int = 100,
        viscosity: float = 0.02,
        inlet_velocity: float = 0.1,
        boundary_config: Optional[Dict] = None,
    ):
        self.nx = max(50, min(nx, 500))
        self.ny = max(25, min(ny, 250))
        
        self.viscosity = max(0.005, min(viscosity, 0.5))
        self.inlet_velocity = max(0.01, min(inlet_velocity, 0.3))
        
        self.tau = 3 * self.viscosity + 0.5
        
        self.q = 9
        self.cx = np.array([0, 1, 0, -1, 0, 1, -1, -1, 1], dtype=np.int32)
        self.cy = np.array([0, 0, 1, 0, -1, 1, 1, -1, -1], dtype=np.int32)
        self.weights = np.array(
            [4/9, 1/9, 1/9, 1/9, 1/9, 1/36, 1/36, 1/36, 1/36],
            dtype=np.float64
        )
        
        self.opposite_indices = [0, 3, 4, 1, 2, 7, 8, 5, 6]
        
        self.default_boundary_config = {
            'left': {'type': 'inlet', 'velocity': [self.inlet_velocity, 0.0]},
            'right': {'type': 'outlet'},
            'top': {'type': 'wall'},
            'bottom': {'type': 'wall'},
            'obstacles': []
        }
        
        self.boundary_config = boundary_config if boundary_config else self.default_boundary_config
        
        self.f = np.zeros((self.nx, self.ny, 9), dtype=np.float64)
        self.eq_f = np.zeros((self.nx, self.ny, 9), dtype=np.float64)
        
        self.obstacle_mask = np.zeros((self.nx, self.ny), dtype=bool)
        self._build_obstacle_mask()
        
        self.rho = np.ones((self.nx, self.ny), dtype=np.float64)
        self.ux = np.zeros((self.nx, self.ny), dtype=np.float64)
        self.uy = np.zeros((self.nx, self.ny), dtype=np.float64)
        
        self._initialize_equilibrium()
        self.f = self.eq_f.copy()
        
        self.step_count = 0
        self.frame_buffer = []
        self.max_buffer_frames = 500

    def _build_obstacle_mask(self):
        self.obstacle_mask[:] = False
        
        for obstacle in self.boundary_config.get('obstacles', []):
            obs_type = obstacle.get('type', 'circle')
            params = obstacle.get('params', {})
            
            if obs_type == 'circle':
                cx, cy = params.get('cx', self.nx // 4), params.get('cy', self.ny // 2)
                r = params.get('r', min(self.nx, self.ny) // 12)
                y_coords, x_coords = np.ogrid[:self.nx, :self.ny]
                mask = (x_coords - cy)**2 + (y_coords - cx)**2 <= r**2
                self.obstacle_mask[mask] = True
            
            elif obs_type == 'rectangle':
                x1, y1 = params.get('x1', 0), params.get('y1', 0)
                x2, y2 = params.get('x2', self.nx), params.get('y2', self.ny)
                self.obstacle_mask[x1:x2, y1:y2] = True

    def update_boundary_config(self, new_config: Dict):
        self.boundary_config.update(new_config)
        self._build_obstacle_mask()
        
        if 'left' in new_config and new_config['left']['type'] == 'inlet':
            self.inlet_velocity = new_config['left']['velocity'][0]

    def _initialize_equilibrium(self):
        inlet_config = self.boundary_config.get('left', {})
        if inlet_config.get('type') == 'inlet':
            vel = inlet_config.get('velocity', [self.inlet_velocity, 0.0])
            y = np.arange(self.ny)
            profile = vel[0] * (1 - np.exp(-(y - self.ny/2)**2 / (2 * (self.ny/6)**2)))
            self.ux[0, :] = profile * 0.5 + vel[0] * 0.5
            self.uy[0, :] = vel[1]
        
        self.rho[:, :] = 1.0
        self._compute_equilibrium()

    def _compute_equilibrium(self):
        u_sqr = self.ux**2 + self.uy**2
        
        for k in range(self.q):
            cu = 3 * (self.cx[k] * self.ux + self.cy[k] * self.uy)
            self.eq_f[:, :, k] = self.rho * self.weights[k] * (
                1 + cu + 0.5 * cu**2 - 1.5 * u_sqr
            )

    def _collision(self):
        omega = 1.0 / self.tau
        self.f = (1 - omega) * self.f + omega * self.eq_f

    def _streaming(self):
        for k in range(self.q):
            self.f[:, :, k] = np.roll(
                np.roll(self.f[:, :, k], self.cx[k], axis=0),
                self.cy[k],
                axis=1
            )

    def _apply_wall_boundary(self, side: str):
        if side == 'top':
            for k in range(self.q):
                if self.cy[k] > 0:
                    self.f[:, 0, self.opposite_indices[k]] = self.f[:, 0, k]
        elif side == 'bottom':
            for k in range(self.q):
                if self.cy[k] < 0:
                    self.f[:, -1, self.opposite_indices[k]] = self.f[:, -1, k]
        elif side == 'left':
            for k in range(self.q):
                if self.cx[k] < 0:
                    self.f[0, :, self.opposite_indices[k]] = self.f[0, :, k]
        elif side == 'right':
            for k in range(self.q):
                if self.cx[k] > 0:
                    self.f[-1, :, self.opposite_indices[k]] = self.f[-1, :, k]

    def _apply_inlet_boundary(self, side: str, config: Dict):
        velocity = config.get('velocity', [self.inlet_velocity, 0.0])
        rho_wall = config.get('density', 1.0)
        
        if side == 'left':
            y = np.arange(self.ny)
            profile = velocity[0] * (1 - np.exp(-(y - self.ny/2)**2 / (2 * (self.ny/6)**2)))
            ux_wall = profile * 0.5 + velocity[0] * 0.5
            uy_wall = np.full_like(y, velocity[1])
            
            u_sqr = ux_wall**2 + uy_wall**2
            
            for k in range(self.q):
                cu = 3 * (self.cx[k] * ux_wall + self.cy[k] * uy_wall)
                eq = rho_wall * self.weights[k] * (1 + cu + 0.5 * cu**2 - 1.5 * u_sqr)
                
                if self.cx[k] > 0:
                    self.f[0, :, k] = eq

    def _apply_outlet_boundary(self, side: str):
        if side == 'right':
            for k in range(self.q):
                if self.cx[k] < 0:
                    self.f[-1, :, k] = self.f[-2, :, k]

    def _apply_obstacle_boundary(self):
        for k in range(self.q):
            self.f[self.obstacle_mask, k] = self.f[self.obstacle_mask, self.opposite_indices[k]]

    def _boundary_conditions(self):
        self._apply_obstacle_boundary()
        
        for side in ['left', 'right', 'top', 'bottom']:
            config = self.boundary_config.get(side, {'type': 'wall'})
            b_type = config.get('type', 'wall')
            
            if b_type == 'wall':
                self._apply_wall_boundary(side)
            elif b_type == 'inlet':
                self._apply_inlet_boundary(side, config)
            elif b_type == 'outlet':
                self._apply_outlet_boundary(side)
        
        self._compute_macroscopic()
        self._enforce_stability()

    def _compute_macroscopic(self):
        self.rho = np.sum(self.f, axis=2)
        self.ux = np.sum(self.f * self.cx[np.newaxis, np.newaxis, :], axis=2) / self.rho
        self.uy = np.sum(self.f * self.cy[np.newaxis, np.newaxis, :], axis=2) / self.rho

    def _enforce_stability(self):
        max_speed = np.sqrt(self.ux**2 + self.uy**2).max()
        if max_speed > 0.5:
            scale = 0.5 / max(max_speed, 1e-8)
            self.ux *= scale
            self.uy *= scale
        
        self.rho = np.clip(self.rho, 0.8, 1.2)
        self.f = np.clip(self.f, 0, None)
        
        rho_sum = np.sum(self.f, axis=2)
        self.f *= (self.rho / rho_sum)[:, :, np.newaxis]

    def step(self, num_steps: int = 1, record_frames: bool = False) -> Dict:
        for _ in range(num_steps):
            self._boundary_conditions()
            self._compute_equilibrium()
            self._collision()
            self._streaming()
            self.step_count += 1
            
            if record_frames and len(self.frame_buffer) < self.max_buffer_frames:
                self.frame_buffer.append(self._get_state_data())
        
        return self.get_state()

    def _get_state_data(self) -> Dict:
        return {
            'step': self.step_count,
            'rho': self.rho.astype(np.float32).tolist(),
            'ux': self.ux.astype(np.float32).tolist(),
            'uy': self.uy.astype(np.float32).tolist(),
            'pressure': ((self.rho - 1.0) / 3.0).astype(np.float32).tolist(),
            'velocity_magnitude': np.sqrt(self.ux**2 + self.uy**2).astype(np.float32).tolist(),
            'vorticity': (np.gradient(self.uy, axis=0) - np.gradient(self.ux, axis=1)).astype(np.float32).tolist()
        }

    def get_state(self) -> Dict:
        state = self._get_state_data()
        state.update({
            'nx': self.nx,
            'ny': self.ny,
            'obstacle': self.obstacle_mask.tolist(),
            'boundary_config': self.boundary_config
        })
        return state

    def get_frames(self) -> List[Dict]:
        return self.frame_buffer

    def clear_frames(self):
        self.frame_buffer = []

    def reset(self):
        self.step_count = 0
        self.clear_frames()
        self.rho[:, :] = 1.0
        self.ux[:, :] = 0.0
        self.uy[:, :] = 0.0
        self._initialize_equilibrium()
        self.f = self.eq_f.copy()
        return self.get_state()

    def set_parameters(self, viscosity: Optional[float] = None, inlet_velocity: Optional[float] = None):
        if viscosity is not None:
            self.viscosity = max(0.005, min(viscosity, 0.5))
            self.tau = 3 * self.viscosity + 0.5
        if inlet_velocity is not None:
            self.inlet_velocity = max(0.01, min(inlet_velocity, 0.3))

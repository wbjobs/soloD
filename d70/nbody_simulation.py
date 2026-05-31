import numpy as np

class NBodySimulation:
    def __init__(self, num_particles=100, dt=0.01, G=1.0, softening=0.1):
        self.num_particles = num_particles
        self.dt = dt
        self.G = G
        self.softening = softening
        
        self.positions = np.random.randn(num_particles, 2) * 2.0
        self.velocities = np.random.randn(num_particles, 2) * 0.5
        self.masses = np.random.rand(num_particles) * 1.0 + 0.5
        
        self.is_blackhole = np.zeros(num_particles, dtype=bool)
        
    def compute_accelerations(self):
        x = self.positions[:, 0:1]
        y = self.positions[:, 1:2]
        
        dx = x.T - x
        dy = y.T - y
        
        inv_r3 = (dx**2 + dy**2 + self.softening**2)**(-1.5)
        
        ax = self.G * (dx * inv_r3) @ self.masses
        ay = self.G * (dy * inv_r3) @ self.masses
        
        return np.column_stack((ax, ay))
    
    def step(self):
        accelerations = self.compute_accelerations()
        self.velocities += accelerations * self.dt
        
        non_blackhole_mask = ~self.is_blackhole
        self.positions[non_blackhole_mask] += self.velocities[non_blackhole_mask] * self.dt
        
        self.positions = np.clip(self.positions, -10, 10)
        
    def add_blackhole(self, x, y, mass=50.0):
        self.positions = np.vstack([self.positions, [x, y]])
        self.velocities = np.vstack([self.velocities, [0.0, 0.0]])
        self.masses = np.append(self.masses, mass)
        self.is_blackhole = np.append(self.is_blackhole, True)
        self.num_particles += 1
        
    def get_positions(self):
        return self.positions.tolist()
    
    def get_blackhole_indices(self):
        return np.where(self.is_blackhole)[0].tolist()

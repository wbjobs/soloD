from fastapi import FastAPI, HTTPException, CORS
from fastapi.responses import JSONResponse, FileResponse
from pydantic import BaseModel
from typing import Optional, List, Dict
import asyncio
from concurrent.futures import ThreadPoolExecutor
import uuid
import json
import pickle
import tempfile
import os
from pathlib import Path

from lbm_simulator import LatticeBoltzmann
from data_storage import DataStorage


app = FastAPI(title="流体力学模拟可视化平台 API", version="2.0.0")

app.add_middleware(
    CORS,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SimulationConfig(BaseModel):
    nx: int = 200
    ny: int = 100
    viscosity: float = 0.02
    inlet_velocity: float = 0.1
    boundary_config: Optional[Dict] = None
    name: str = "Untitled"


class BoundaryConfig(BaseModel):
    left: Optional[Dict] = None
    right: Optional[Dict] = None
    top: Optional[Dict] = None
    bottom: Optional[Dict] = None
    obstacles: Optional[List[Dict]] = None


class SimulationManager:
    def __init__(self):
        self.simulators = {}
        self.storage = DataStorage()
        self.executor = ThreadPoolExecutor(max_workers=8)

    def create_simulator(self, config: SimulationConfig) -> str:
        sim_id = str(uuid.uuid4())
        simulator = LatticeBoltzmann(
            nx=config.nx,
            ny=config.ny,
            viscosity=config.viscosity,
            inlet_velocity=config.inlet_velocity,
            boundary_config=config.boundary_config
        )
        self.simulators[sim_id] = {
            'simulator': simulator,
            'config': config.dict(),
            'running': False,
            'name': config.name
        }
        return sim_id

    def get_simulator(self, sim_id: str):
        if sim_id not in self.simulators:
            raise HTTPException(status_code=404, detail="Simulation not found")
        return self.simulators[sim_id]

    def get_all_simulations(self):
        return [
            {
                'id': sim_id,
                'name': data['name'],
                'config': data['config'],
                'step': data['simulator'].step_count
            }
            for sim_id, data in self.simulators.items()
        ]


manager = SimulationManager()


@app.get("/")
async def root():
    return {"message": "流体力学模拟可视化平台 API v2.0", "version": "2.0.0"}


@app.post("/api/simulations")
async def create_simulation(config: SimulationConfig):
    sim_id = manager.create_simulator(config)
    state = await asyncio.get_event_loop().run_in_executor(
        manager.executor,
        lambda: manager.simulators[sim_id]['simulator'].get_state()
    )
    return {
        "simulation_id": sim_id,
        "config": config.dict(),
        "state": state,
        "message": "Simulation created successfully"
    }


@app.get("/api/simulations")
async def list_simulations():
    return {"simulations": manager.get_all_simulations()}


@app.get("/api/simulations/{sim_id}")
async def get_simulation(sim_id: str):
    sim_data = manager.get_simulator(sim_id)
    return {
        "simulation_id": sim_id,
        "name": sim_data['name'],
        "config": sim_data['config'],
        "running": sim_data['running']
    }


@app.get("/api/simulations/{sim_id}/state")
async def get_simulation_state(sim_id: str):
    sim_data = manager.get_simulator(sim_id)
    state = await asyncio.get_event_loop().run_in_executor(
        manager.executor,
        lambda: sim_data['simulator'].get_state()
    )
    return state


@app.post("/api/simulations/{sim_id}/step")
async def step_simulation(sim_id: str, steps: int = 10, record: bool = False):
    sim_data = manager.get_simulator(sim_id)
    simulator = sim_data['simulator']
    
    loop = asyncio.get_event_loop()
    state = await loop.run_in_executor(
        manager.executor,
        lambda: simulator.step(steps, record)
    )
    return state


@app.post("/api/simulations/{sim_id}/reset")
async def reset_simulation(sim_id: str):
    sim_data = manager.get_simulator(sim_id)
    state = sim_data['simulator'].reset()
    return state


@app.delete("/api/simulations/{sim_id}")
async def delete_simulation(sim_id: str):
    if sim_id in manager.simulators:
        del manager.simulators[sim_id]
        return {"message": "Simulation deleted successfully"}
    raise HTTPException(status_code=404, detail="Simulation not found")


@app.post("/api/simulations/{sim_id}/parameters")
async def update_parameters(
    sim_id: str,
    viscosity: Optional[float] = None,
    inlet_velocity: Optional[float] = None
):
    sim_data = manager.get_simulator(sim_id)
    sim_data['simulator'].set_parameters(viscosity=viscosity, inlet_velocity=inlet_velocity)
    return {"message": "Parameters updated successfully"}


@app.post("/api/simulations/{sim_id}/boundary")
async def update_boundary_config(sim_id: str, boundary_config: BoundaryConfig):
    sim_data = manager.get_simulator(sim_id)
    new_config = {k: v for k, v in boundary_config.dict().items() if v is not None}
    sim_data['simulator'].update_boundary_config(new_config)
    return {"message": "Boundary configuration updated successfully", "boundary_config": new_config}


@app.post("/api/simulations/{sim_id}/save")
async def save_simulation(sim_id: str, name: str, description: str = ""):
    sim_data = manager.get_simulator(sim_id)
    simulator = sim_data['simulator']
    frames = simulator.get_frames()
    
    if not frames:
        state = simulator.get_state()
        frames = [{'step': state['step'], 'state': state}]
    
    saved_id = manager.storage.save_simulation(
        name=name,
        description=description,
        parameters=sim_data['config'],
        frames=frames
    )
    
    return {"saved_id": saved_id, "frame_count": len(frames), "message": "Simulation saved successfully"}


@app.get("/api/simulations/{sim_id}/export/data")
async def export_simulation_data(sim_id: str):
    sim_data = manager.get_simulator(sim_id)
    simulator = sim_data['simulator']
    frames = simulator.get_frames()
    
    if not frames:
        state = simulator.get_state()
        frames = [{'step': state['step'], 'state': state}]
    
    export_data = {
        "simulation_id": sim_id,
        "config": sim_data['config'],
        "frame_count": len(frames),
        "frames": frames
    }
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        json.dump(export_data, f, indent=2)
        temp_path = f.name
    
    return FileResponse(
        temp_path,
        media_type='application/json',
        filename=f'simulation_{sim_id[:8]}.json'
    )


@app.get("/api/simulations/{sim_id}/export/csv")
async def export_simulation_csv(sim_id: str):
    sim_data = manager.get_simulator(sim_id)
    simulator = sim_data['simulator']
    state = simulator.get_state()
    
    import csv
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False, newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['x', 'y', 'ux', 'uy', 'pressure', 'velocity_magnitude', 'vorticity'])
        
        for i in range(state['nx']):
            for j in range(state['ny']):
                writer.writerow([
                    i, j,
                    state['ux'][i][j],
                    state['uy'][i][j],
                    state['pressure'][i][j],
                    state['velocity_magnitude'][i][j],
                    state['vorticity'][i][j]
                ])
        temp_path = f.name
    
    return FileResponse(
        temp_path,
        media_type='text/csv',
        filename=f'simulation_data_{sim_id[:8]}.csv'
    )


@app.get("/api/saved")
async def get_saved_simulations():
    simulations = manager.storage.get_simulation_list()
    return {"simulations": simulations}


@app.get("/api/saved/{saved_id}")
async def load_saved_simulation(saved_id: str):
    sim_data = manager.storage.load_simulation(saved_id)
    if not sim_data:
        raise HTTPException(status_code=404, detail="Saved simulation not found")
    return sim_data


@app.delete("/api/saved/{saved_id}")
async def delete_saved_simulation(saved_id: str):
    success = manager.storage.delete_simulation(saved_id)
    if not success:
        raise HTTPException(status_code=404, detail="Saved simulation not found")
    return {"message": "Simulation deleted successfully"}


@app.get("/api/algorithms/lbm")
async def get_lbm_info():
    return {
        "name": "Lattice Boltzmann Method",
        "description": "基于D2Q9格子玻尔兹曼模型的流体模拟",
        "lattice": "D2Q9",
        "boundary_types": ["wall", "inlet", "outlet"],
        "obstacle_types": ["circle", "rectangle"],
        "parameters": {
            "nx": "网格x方向大小",
            "ny": "网格y方向大小",
            "viscosity": "运动粘度",
            "inlet_velocity": "入口速度"
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

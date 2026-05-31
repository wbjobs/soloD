import pickle
import json
import os
from datetime import datetime
from typing import List, Dict, Optional
from pathlib import Path


class DataStorage:
    def __init__(self, data_dir: str = "../data"):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.simulations_dir = self.data_dir / "simulations"
        self.simulations_dir.mkdir(exist_ok=True)
        self.index_file = self.data_dir / "index.json"
        self._load_index()

    def _load_index(self):
        if self.index_file.exists():
            with open(self.index_file, "r") as f:
                self.index = json.load(f)
        else:
            self.index = {"simulations": []}

    def _save_index(self):
        with open(self.index_file, "w") as f:
            json.dump(self.index, f, indent=2)

    def save_simulation(
        self,
        name: str,
        parameters: Dict,
        frames: List[Dict],
        description: str = ""
    ) -> str:
        sim_id = f"sim_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        sim_data = {
            "id": sim_id,
            "name": name,
            "description": description,
            "parameters": parameters,
            "created_at": datetime.now().isoformat(),
            "frame_count": len(frames),
            "frames": frames
        }
        
        file_path = self.simulations_dir / f"{sim_id}.pkl"
        with open(file_path, "wb") as f:
            pickle.dump(sim_data, f)
        
        self.index["simulations"].append({
            "id": sim_id,
            "name": name,
            "description": description,
            "parameters": parameters,
            "created_at": sim_data["created_at"],
            "frame_count": len(frames)
        })
        self._save_index()
        
        return sim_id

    def get_simulation_list(self) -> List[Dict]:
        return self.index.get("simulations", [])

    def load_simulation(self, sim_id: str) -> Optional[Dict]:
        file_path = self.simulations_dir / f"{sim_id}.pkl"
        if not file_path.exists():
            return None
        
        with open(file_path, "rb") as f:
            return pickle.load(f)

    def delete_simulation(self, sim_id: str) -> bool:
        file_path = self.simulations_dir / f"{sim_id}.pkl"
        if file_path.exists():
            file_path.unlink()
            
            self.index["simulations"] = [
                sim for sim in self.index["simulations"]
                if sim["id"] != sim_id
            ]
            self._save_index()
            return True
        return False

    def save_frame(self, sim_id: str, frame_data: Dict, frame_index: int):
        pass

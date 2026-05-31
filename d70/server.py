import asyncio
import websockets
import json
import concurrent.futures
from nbody_simulation import NBodySimulation

connected_clients = set()
simulation_instance = None
SIMULATION_RATE = 60
BROADCAST_RATE = 30
SIMULATION_DT = 1 / SIMULATION_RATE
BLACKHOLE_MASS = 50.0

async def broadcast_data(positions, blackhole_indices):
    if connected_clients:
        message = json.dumps({
            "positions": positions,
            "blackhole_indices": blackhole_indices
        })
        await asyncio.gather(*[client.send(message) for client in connected_clients])

async def handle_client(websocket):
    global simulation_instance
    print(f"New client connected. Total clients: {len(connected_clients) + 1}")
    connected_clients.add(websocket)
    
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                if data.get("type") == "add_blackhole" and simulation_instance:
                    x = data.get("x", 0)
                    y = data.get("y", 0)
                    print(f"Adding blackhole at ({x:.2f}, {y:.2f})")
                    simulation_instance.add_blackhole(x, y, BLACKHOLE_MASS)
            except json.JSONDecodeError:
                print(f"Invalid JSON received: {message}")
            except Exception as e:
                print(f"Error processing message: {e}")
    finally:
        connected_clients.remove(websocket)
        print(f"Client disconnected. Total clients: {len(connected_clients)}")

async def simulation_loop(executor):
    global simulation_instance
    sim = NBodySimulation(num_particles=100, dt=SIMULATION_DT)
    simulation_instance = sim
    loop = asyncio.get_running_loop()
    simulation_interval = 1 / SIMULATION_RATE
    broadcast_interval = 1 / BROADCAST_RATE
    last_broadcast_time = 0
    
    while True:
        start_time = loop.time()
        
        await loop.run_in_executor(executor, sim.step)
        
        current_time = loop.time()
        if current_time - last_broadcast_time >= broadcast_interval:
            positions = sim.get_positions()
            blackhole_indices = sim.get_blackhole_indices()
            await broadcast_data(positions, blackhole_indices)
            last_broadcast_time = current_time
        
        elapsed = loop.time() - start_time
        sleep_time = max(0, simulation_interval - elapsed)
        await asyncio.sleep(sleep_time)

async def main():
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
    
    server = await websockets.serve(
        handle_client, 
        "localhost", 
        8765,
        ping_interval=20,
        ping_timeout=20
    )
    
    simulation_task = asyncio.create_task(simulation_loop(executor))
    
    print("WebSocket server started on ws://localhost:8765")
    print(f"Simulation rate: {SIMULATION_RATE} Hz")
    print(f"Broadcast rate: {BROADCAST_RATE} Hz")
    print(f"Blackhole mass: {BLACKHOLE_MASS}")
    print("Click on the canvas to add black holes!")
    print("Waiting for clients to connect...")
    
    try:
        await server.wait_closed()
    finally:
        simulation_task.cancel()
        executor.shutdown(wait=False)

if __name__ == "__main__":
    asyncio.run(main())

#!/usr/bin/env python3
import socket
import threading
import random
import time
import sys
import math
from collections import defaultdict

class Monster:
    def __init__(self, monster_id, x, y, monster_type='goblin'):
        self.id = monster_id
        self.x = x
        self.y = y
        self.type = monster_type
        self.health = 30
        self.damage = 5
        self.speed = 0.3  # 移动间隔（秒）
        self.last_move = 0
        
    def get_symbol(self):
        symbols = {
            'goblin': 'G',
            'orc': 'O',
            'skeleton': 'S',
            'demon': 'D'
        }
        return symbols.get(self.type, 'M')
    
    def get_name(self):
        names = {
            'goblin': '哥布林',
            'orc': '兽人',
            'skeleton': '骷髅',
            'demon': '恶魔'
        }
        return names.get(self.type, '怪物')

class BSPMap:
    def __init__(self, width=80, height=40):
        self.width = width
        self.height = height
        self.tiles = [['#' for _ in range(width)] for _ in range(height)]
        self.rooms = []
        
    def generate(self):
        self._carve_room(5, 5, 15, 10)
        self._carve_room(30, 5, 15, 10)
        self._carve_room(55, 5, 15, 10)
        self._carve_room(5, 25, 15, 10)
        self._carve_room(30, 25, 15, 10)
        self._carve_room(55, 25, 15, 10)
        
        self._carve_h_corridor(12, 37, 10)
        self._carve_h_corridor(37, 62, 10)
        self._carve_h_corridor(12, 37, 30)
        self._carve_h_corridor(37, 62, 30)
        self._carve_v_corridor(10, 30, 22)
        self._carve_v_corridor(10, 30, 52)
        
    def _carve_room(self, x, y, w, h):
        for ry in range(y, min(y + h, self.height)):
            for rx in range(x, min(x + w, self.width)):
                self.tiles[ry][rx] = '.'
        self.rooms.append((x, y, w, h))
        
    def _carve_h_corridor(self, x1, x2, y):
        start = max(0, min(x1, x2))
        end = min(self.width - 1, max(x1, x2))
        for x in range(start, end + 1):
            if 0 <= y < self.height:
                self.tiles[y][x] = '.'
                
    def _carve_v_corridor(self, y1, y2, x):
        start = max(0, min(y1, y2))
        end = min(self.height - 1, max(y1, y2))
        for y in range(start, end + 1):
            if 0 <= x < self.width:
                self.tiles[y][x] = '.'
        
    def is_floor(self, x, y):
        return 0 <= x < self.width and 0 <= y < self.height and self.tiles[y][x] == '.'
        
    def is_wall(self, x, y):
        return not self.is_floor(x, y)
        
    def get_random_floor(self):
        floors = []
        for y in range(self.height):
            for x in range(self.width):
                if self.tiles[y][x] == '.':
                    floors.append((x, y))
        return random.choice(floors) if floors else (self.width // 2, self.height // 2)

class GameServer:
    def __init__(self, host='localhost', port=2323):
        self.host = host
        self.port = port
        self.running = False
        self.map = BSPMap(80, 40)
        self.map.generate()
        
        self.clients = {}
        self.players = {}
        self.monsters = {}
        self.next_client_id = 1
        self.next_monster_id = 1
        self.lock = threading.Lock()
        
        self._spawn_initial_monsters()
        
    def _spawn_initial_monsters(self):
        monster_types = ['goblin', 'orc', 'skeleton', 'demon']
        num_monsters = 8
        
        for i in range(num_monsters):
            x, y = self.map.get_random_floor()
            monster_type = random.choice(monster_types)
            monster = Monster(self.next_monster_id, x, y, monster_type)
            self.monsters[self.next_monster_id] = monster
            self.next_monster_id += 1
            print(f"Spawned {monster.get_name()} at ({x}, {y})")
    
    def set_non_blocking(self, sock):
        sock.setblocking(False)
        
    def start(self):
        self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        
        try:
            self.server_socket.bind((self.host, self.port))
        except Exception as e:
            print(f"Failed to bind: {e}")
            return False
            
        self.server_socket.listen(5)
        self.set_non_blocking(self.server_socket)
        
        self.running = True
        
        print(f"Server started on {self.host}:{self.port}")
        print(f"Spawned {len(self.monsters)} monsters")
        print("Map generated:")
        self._print_map()
        
        accept_thread = threading.Thread(target=self._accept_loop, daemon=True)
        accept_thread.start()
        
        ai_thread = threading.Thread(target=self._monster_ai_loop, daemon=True)
        ai_thread.start()
        
        return True
        
    def _print_map(self):
        for y in range(min(30, self.map.height)):
            row = []
            for x in range(min(60, self.map.width)):
                c = '#' if self.map.is_wall(x, y) else '.'
                for monster in self.monsters.values():
                    if monster.x == x and monster.y == y:
                        c = monster.get_symbol()
                        break
                row.append(c)
            print(''.join(row))
        
    def _accept_loop(self):
        while self.running:
            try:
                client_socket, addr = self.server_socket.accept()
                print(f"New connection from {addr}")
                self.set_non_blocking(client_socket)
                self._handle_new_client(client_socket)
            except BlockingIOError:
                time.sleep(0.01)
            except Exception as e:
                print(f"Accept error: {e}")
                break
                
    def _handle_new_client(self, client_socket):
        with self.lock:
            client_id = self.next_client_id
            self.next_client_id += 1
            self.clients[client_id] = client_socket
            
            start_x, start_y = self.map.get_random_floor()
            self.players[client_id] = {
                'x': start_x,
                'y': start_y,
                'name': f'Player{client_id}'
            }
            
        print(f"Client {client_id} connected at ({start_x}, {start_y})")
        
        welcome = "\x1B[H\x1B[2J"
        welcome += "Welcome to Dungeon! Use WASD to move.\r\n"
        welcome += f"Monsters roaming: {len(self.monsters)} - Watch out!\r\n"
        self._send_to_client(client_id, welcome)
        self._send_map_to_client(client_id)
        
        client_thread = threading.Thread(
            target=self._client_handler,
            args=(client_id,),
            daemon=True
        )
        client_thread.start()
    
    def _client_handler(self, client_id):
        while self.running:
            try:
                with self.lock:
                    if client_id not in self.clients:
                        break
                    socket = self.clients[client_id]
                    
                try:
                    data = socket.recv(1024)
                    if not data:
                        break
                        
                    decoded = data.decode('utf-8', errors='ignore')
                    
                    with self.lock:
                        for c in decoded:
                            dx, dy = 0, 0
                            if c.lower() == 'w':
                                dy = -1
                            elif c.lower() == 's':
                                dy = 1
                            elif c.lower() == 'a':
                                dx = -1
                            elif c.lower() == 'd':
                                dx = 1
                                
                            if dx != 0 or dy != 0:
                                self._process_move(client_id, dx, dy)
                                
                except BlockingIOError:
                    time.sleep(0.01)
                    continue
                    
            except Exception as e:
                print(f"Client {client_id} error: {e}")
                break
        
        self._remove_client(client_id)
    
    def _process_move(self, client_id, dx, dy):
        if client_id not in self.players:
            return
            
        player = self.players[client_id]
        new_x = player['x'] + dx
        new_y = player['y'] + dy
        
        if self._is_valid_move(new_x, new_y, client_id):
            player['x'] = new_x
            player['y'] = new_y
            
        self._broadcast_map()
    
    def _is_valid_move(self, x, y, exclude_client_id=None):
        if not self.map.is_floor(x, y):
            return False
            
        for cid, player in self.players.items():
            if cid != exclude_client_id and player['x'] == x and player['y'] == y:
                return False
                
        for monster in self.monsters.values():
            if monster.x == x and monster.y == y:
                return False
                
        return True
    
    def _monster_ai_loop(self):
        while self.running:
            current_time = time.time()
            
            with self.lock:
                for monster in list(self.monsters.values()):
                    if current_time - monster.last_move < monster.speed:
                        continue
                    
                    nearest_player = None
                    nearest_dist = float('inf')
                    
                    for player in self.players.values():
                        dist = math.hypot(player['x'] - monster.x, player['y'] - monster.y)
                        if dist < nearest_dist:
                            nearest_dist = dist
                            nearest_player = player
                    
                    if nearest_player and nearest_dist <= 15:
                        dx = 0
                        dy = 0
                        
                        if nearest_player['x'] > monster.x:
                            dx = 1
                        elif nearest_player['x'] < monster.x:
                            dx = -1
                            
                        if nearest_player['y'] > monster.y:
                            dy = 1
                        elif nearest_player['y'] < monster.y:
                            dy = -1
                        
                        if dx != 0 and random.random() < 0.5:
                            new_x = monster.x + dx
                            new_y = monster.y
                            if self._is_monster_valid_move(new_x, new_y, monster.id):
                                monster.x = new_x
                                monster.last_move = current_time
                        elif dy != 0:
                            new_x = monster.x
                            new_y = monster.y + dy
                            if self._is_monster_valid_move(new_x, new_y, monster.id):
                                monster.y = new_y
                                monster.last_move = current_time
                
                if self.players:
                    self._broadcast_map()
            
            time.sleep(0.1)
    
    def _is_monster_valid_move(self, x, y, monster_id):
        if not self.map.is_floor(x, y):
            return False
            
        for player in self.players.values():
            if player['x'] == x and player['y'] == y:
                return False
                
        for mid, monster in self.monsters.items():
            if mid != monster_id and monster.x == x and monster.y == y:
                return False
                
        return True
    
    def _get_map_display(self, client_id):
        if client_id not in self.players:
            return ""
            
        player = self.players[client_id]
        
        output = []
        output.append("\x1B[H")
        
        view_width = 40
        view_height = 20
        start_x = max(0, player['x'] - view_width // 2)
        start_y = max(0, player['y'] - view_height // 2)
        end_x = min(self.map.width, start_x + view_width)
        end_y = min(self.map.height, start_y + view_height)
        
        for y in range(start_y, end_y):
            row = []
            for x in range(start_x, end_x):
                c = '#' if self.map.is_wall(x, y) else '.'
                
                for monster in self.monsters.values():
                    if monster.x == x and monster.y == y:
                        c = monster.get_symbol()
                        break
                
                for cid, p in self.players.items():
                    if p['x'] == x and p['y'] == y:
                        c = '@' if cid == client_id else 'P'
                        break
                        
                row.append(c)
            output.append(''.join(row))
        
        output.append("")
        output.append(f"Players online: {len(self.players)}  Monsters: {len(self.monsters)}")
        output.append(f"Your position: ({player['x']}, {player['y']})")
        output.append("Use WASD to move - Monsters are chasing you!")
        output.append("----------------------------------------")
        
        return '\r\n'.join(output) + '\r\n'
    
    def _broadcast_map(self):
        for client_id in list(self.clients.keys()):
            self._send_map_to_client(client_id)
    
    def _send_map_to_client(self, client_id):
        map_data = self._get_map_display(client_id)
        self._send_to_client(client_id, map_data)
    
    def _send_to_client(self, client_id, message):
        if client_id not in self.clients:
            return
            
        try:
            self.clients[client_id].send(message.encode('utf-8'))
        except:
            pass
    
    def _remove_client(self, client_id):
        with self.lock:
            print(f"Client {client_id} disconnecting...")
            
            if client_id in self.clients:
                try:
                    self.clients[client_id].close()
                except:
                    pass
                del self.clients[client_id]
                
            if client_id in self.players:
                del self.players[client_id]
                
        print(f"Client {client_id} disconnected")
        self._broadcast_map()
    
    def run(self):
        try:
            while self.running:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\nShutting down...")
            self.stop()
    
    def stop(self):
        self.running = False
        
        for client_id in list(self.clients.keys()):
            self._remove_client(client_id)
            
        try:
            self.server_socket.close()
        except:
            pass

def main():
    print("=" * 50)
    print("DUNGEON GAME SERVER - WITH MONSTER AI")
    print("=" * 50)
    
    server = GameServer('localhost', 2323)
    if not server.start():
        print("Failed to start server!")
        sys.exit(1)
        
    server.run()

if __name__ == '__main__':
    main()

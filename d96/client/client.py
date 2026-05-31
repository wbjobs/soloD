#!/usr/bin/env python3
import socket
import threading
import sys
import time
import queue

try:
    import curses
    CURSES_AVAILABLE = True
except ImportError:
    CURSES_AVAILABLE = False
    print("curses module not available! Falling back to simple mode.")

class DungeonClient:
    def __init__(self, host='localhost', port=2323):
        self.host = host
        self.port = port
        self.socket = None
        self.running = False
        self.stdscr = None
        self.display_buffer = []
        self.message_queue = queue.Queue()
        self.input_queue = queue.Queue()
        self.lock = threading.Lock()
        
    def connect(self):
        try:
            self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.socket.settimeout(5.0)
            self.socket.connect((self.host, self.port))
            self.socket.setblocking(False)
            self.running = True
            return True
        except Exception as e:
            print(f"Failed to connect: {e}")
            return False
    
    def receive_thread(self):
        buffer = ""
        while self.running:
            try:
                data = self.socket.recv(8192)
                if not data:
                    self.running = False
                    self.message_queue.put("Disconnected from server.")
                    break
                
                decoded = data.decode('utf-8', errors='replace')
                buffer += decoded
                
                lines = buffer.split('\r\n')
                if buffer.endswith('\r\n'):
                    buffer = ""
                else:
                    buffer = lines.pop()
                
                with self.lock:
                    self.display_buffer.extend(lines)
                    if len(self.display_buffer) > 100:
                        self.display_buffer = self.display_buffer[-50:]
                
            except socket.error as e:
                if 'would block' not in str(e).lower():
                    time.sleep(0.01)
                continue
            except Exception as e:
                self.message_queue.put(f"Receive error: {e}")
                break
    
    def send_key(self, key):
        try:
            self.socket.send(key.encode('utf-8'))
        except:
            pass
    
    def update_display_curses(self):
        if not self.stdscr:
            return
        
        try:
            self.stdscr.clear()
            height, width = self.stdscr.getmaxyx()
            
            with self.lock:
                lines = self.display_buffer[-height:]
            
            for i, line in enumerate(lines):
                if i >= height - 1:
                    break
                try:
                    clean_line = ''.join(c for c in line if ord(c) >= 32 or c in '\n\r\t')
                    clean_line = clean_line.replace('\t', '    ')
                    
                    if len(clean_line) > width - 1:
                        clean_line = clean_line[:width-1]
                    
                    self.stdscr.addstr(i, 0, clean_line)
                except:
                    pass
            
            status = f"WASD/Arrows to move | ESC to quit | Connected to {self.host}:{self.port}"
            if len(status) > width - 1:
                status = status[:width-1]
            try:
                self.stdscr.addstr(height - 1, 0, status, curses.A_REVERSE)
            except:
                pass
            
            self.stdscr.refresh()
        except Exception as e:
            self.message_queue.put(f"Display error: {e}")
    
    def run_curses(self):
        try:
            self.stdscr = curses.initscr()
            curses.noecho()
            curses.cbreak()
            curses.curs_set(0)
            self.stdscr.keypad(True)
            self.stdscr.timeout(50)
            
            last_key_time = time.time()
            key_cooldown = 0.05
            
            while self.running:
                try:
                    key = self.stdscr.getch()
                    current_time = time.time()
                    
                    if key != -1 and current_time - last_key_time >= key_cooldown:
                        last_key_time = current_time
                        
                        if key == curses.KEY_UP:
                            self.send_key('w')
                        elif key == curses.KEY_DOWN:
                            self.send_key('s')
                        elif key == curses.KEY_LEFT:
                            self.send_key('a')
                        elif key == curses.KEY_RIGHT:
                            self.send_key('d')
                        elif key in [ord('w'), ord('W')]:
                            self.send_key('w')
                        elif key in [ord('s'), ord('S')]:
                            self.send_key('s')
                        elif key in [ord('a'), ord('A')]:
                            self.send_key('a')
                        elif key in [ord('d'), ord('D')]:
                            self.send_key('d')
                        elif key == 27:
                            self.running = False
                            break
                    
                    self.update_display_curses()
                    
                except Exception as e:
                    self.message_queue.put(f"Input error: {e}")
                    break
                    
        finally:
            if self.stdscr:
                curses.nocbreak()
                self.stdscr.keypad(False)
                curses.echo()
                curses.curs_set(1)
                curses.endwin()
    
    def run_simple(self):
        print("=== Simple Mode ===")
        print("Use WASD to move, Q to quit")
        print("Connected to dungeon!\n")
        
        import select
        last_display = time.time()
        
        while self.running:
            try:
                ready, _, _ = select.select([sys.stdin, self.socket], [], [], 0.1)
                
                for s in ready:
                    if s == self.socket:
                        data = self.socket.recv(4096)
                        if not data:
                            self.running = False
                            break
                        text = data.decode('utf-8', errors='replace')
                        lines = text.split('\r\n')
                        for line in lines[:30]:
                            if line.strip():
                                print(line)
                    elif s == sys.stdin:
                        line = sys.stdin.readline().strip()
                        if line.lower() == 'q':
                            self.running = False
                            break
                        for c in line:
                            self.send_key(c)
                
                current_time = time.time()
                if current_time - last_display > 0.1:
                    last_display = current_time
                    
            except KeyboardInterrupt:
                self.running = False
                break
            except Exception as e:
                print(f"Error: {e}")
                break
    
    def start(self):
        if not self.connect():
            return
        
        receive_thread = threading.Thread(target=self.receive_thread, daemon=True)
        receive_thread.start()
        
        print("Starting game client...")
        time.sleep(0.5)
        
        if CURSES_AVAILABLE:
            self.run_curses()
        else:
            self.run_simple()
        
        self.running = False
        receive_thread.join(timeout=1.0)
        if self.socket:
            self.socket.close()
        print("\nDisconnected from server. Goodbye!")

def main():
    import argparse
    parser = argparse.ArgumentParser(description='Dungeon Game Client')
    parser.add_argument('--host', default='localhost', help='Server hostname')
    parser.add_argument('--port', type=int, default=2323, help='Server port')
    args = parser.parse_args()
    
    print("Dungeon Game Client")
    print("-" * 40)
    print(f"Connecting to {args.host}:{args.port}...")
    
    client = DungeonClient(args.host, args.port)
    client.start()

if __name__ == '__main__':
    main()

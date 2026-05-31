#!/usr/bin/env python3
import sys
import socket
import os
import json
import time
import signal
import threading
from datetime import datetime

try:
    from bcc import BPF
except ImportError as e:
    print("=" * 60)
    print("ERROR: Failed to import bcc module!")
    print("=" * 60)
    print("\nThis script requires the BPF Compiler Collection (bcc).")
    print("Please install it using one of the following methods:\n")
    print("Ubuntu/Debian:")
    print("  sudo apt-get update")
    print("  sudo apt-get install bpfcc-tools python3-bpfcc")
    print("  sudo apt-get install linux-headers-$(uname -r)")
    print("\nIf you still see this error after installation, try:")
    print("  sudo pip3 install bcc")
    print("\nOriginal error:", str(e))
    print("=" * 60)
    sys.exit(1)

SOCKET_PATH = "/tmp/syscall_monitor.sock"
CONTROL_SOCKET_PATH = "/tmp/syscall_monitor_control.sock"

BPF_PROGRAM_TEMPLATE = """
#include <uapi/linux/ptrace.h>
#include <linux/sched.h>
#include <linux/fs.h>

struct data_t {
    u32 pid;
    char comm[TASK_COMM_LEN];
    char fname[DNAME_INLINE_LEN];
    u64 timestamp;
};

BPF_PERF_OUTPUT(events);

TRACEPOINT_PROBE(syscalls, sys_enter_openat) {
    struct data_t data = {};
    u32 pid = bpf_get_current_pid_tgid() >> 32;
    u32 target_pid = {TARGET_PID};
    
    if (target_pid != 0 && pid != target_pid) {
        return 0;
    }
    
    data.pid = pid;
    data.timestamp = bpf_ktime_get_ns();
    bpf_get_current_comm(&data.comm, sizeof(data.comm));
    
    const char __user *filename = (const char __user *)args->filename;
    if (filename != NULL) {
        bpf_probe_read_user_str(&data.fname, sizeof(data.fname), filename);
    }
    
    events.perf_submit(args, &data, sizeof(data));
    
    return 0;
}
"""

class SyscallMonitor:
    def __init__(self, initial_pid=0):
        self.target_pid = initial_pid
        self.bpf = None
        self.server_sock = None
        self.control_sock = None
        self.conn = None
        self.running = False
        self.event_count = 0
        self.lock = threading.Lock()
        
        signal.signal(signal.SIGINT, self.signal_handler)
        signal.signal(signal.SIGTERM, self.signal_handler)
        
    def signal_handler(self, signum, frame):
        print(f"\nReceived signal {signum}, stopping gracefully...")
        self.running = False
        
    def setup_socket(self):
        print(f"\n[SETUP] Setting up Unix Domain Socket...")
        
        if os.path.exists(SOCKET_PATH):
            print(f"[SETUP] Removing existing socket file: {SOCKET_PATH}")
            try:
                os.remove(SOCKET_PATH)
            except Exception as e:
                print(f"[WARNING] Failed to remove existing socket: {e}")
        
        try:
            self.server_sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            self.server_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.server_sock.bind(SOCKET_PATH)
            self.server_sock.listen(1)
            self.server_sock.settimeout(5)
            os.chmod(SOCKET_PATH, 0o666)
            print(f"[SETUP] ✓ Unix Domain Socket ready at {SOCKET_PATH}")
            return True
        except socket.error as e:
            print(f"[ERROR] ✗ Failed to create Unix Domain Socket: {e}")
            return False
            
    def setup_control_socket(self):
        print(f"\n[SETUP] Setting up Control Socket...")
        
        if os.path.exists(CONTROL_SOCKET_PATH):
            try:
                os.remove(CONTROL_SOCKET_PATH)
            except Exception as e:
                print(f"[WARNING] Failed to remove existing control socket: {e}")
        
        try:
            self.control_sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            self.control_sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.control_sock.bind(CONTROL_SOCKET_PATH)
            self.control_sock.listen(5)
            self.control_sock.settimeout(2)
            os.chmod(CONTROL_SOCKET_PATH, 0o666)
            print(f"[SETUP] ✓ Control Socket ready at {CONTROL_SOCKET_PATH}")
            
            control_thread = threading.Thread(target=self.control_socket_handler, daemon=True)
            control_thread.start()
            return True
        except socket.error as e:
            print(f"[ERROR] ✗ Failed to create Control Socket: {e}")
            return False
            
    def control_socket_handler(self):
        while self.running:
            try:
                conn, addr = self.control_sock.accept()
                conn.settimeout(5)
                try:
                    data = conn.recv(1024).decode('utf-8').strip()
                    if data:
                        try:
                            command = json.loads(data)
                            if command.get('action') == 'set_pid':
                                new_pid = command.get('pid', 0)
                                print(f"\n[CONTROL] Received set_pid command: {new_pid}")
                                self.reconfigure_pid(new_pid)
                                response = {'status': 'ok', 'pid': new_pid}
                                conn.sendall(json.dumps(response).encode('utf-8'))
                            elif command.get('action') == 'get_pid':
                                response = {'status': 'ok', 'pid': self.target_pid}
                                conn.sendall(json.dumps(response).encode('utf-8'))
                            else:
                                response = {'status': 'error', 'message': 'Unknown action'}
                                conn.sendall(json.dumps(response).encode('utf-8'))
                        except json.JSONDecodeError:
                            response = {'status': 'error', 'message': 'Invalid JSON'}
                            conn.sendall(json.dumps(response).encode('utf-8'))
                finally:
                    conn.close()
            except socket.timeout:
                continue
            except Exception as e:
                print(f"[CONTROL] Error: {e}")
                
    def reconfigure_pid(self, new_pid):
        with self.lock:
            print(f"[RECONF] Reconfiguring to monitor PID: {new_pid}")
            
            if self.bpf:
                try:
                    self.bpf.cleanup()
                except:
                    pass
                    
            self.target_pid = new_pid
            self.event_count = 0
            
            bpf_program = BPF_PROGRAM_TEMPLATE.replace("{TARGET_PID}", str(new_pid))
            self.bpf = BPF(text=bpf_program)
            
            def handle_event(cpu, data, size):
                try:
                    event = self.bpf["events"].event(data)
                    self.event_count += 1
                    
                    data_dict = {
                        "pid": event.pid,
                        "comm": event.comm.decode('utf-8', 'replace'),
                        "filename": event.fname.decode('utf-8', 'replace'),
                        "timestamp": datetime.now().isoformat()
                    }
                    
                    if self.conn:
                        json_data = json.dumps(data_dict) + "\n"
                        try:
                            self.conn.sendall(json_data.encode('utf-8'))
                            if self.event_count % 10 == 0:
                                print(f"[INFO] Sent {self.event_count} events...", end='\r')
                        except (socket.error, BrokenPipeError) as e:
                            print(f"\n[WARN] Connection lost: {e}")
                            self.conn = None
                except Exception as e:
                    print(f"\n[ERROR] Event handling error: {e}")
            
            self.bpf["events"].open_perf_buffer(handle_event)
            print(f"[RECONF] ✓ Successfully reconfigured to PID: {new_pid}")
            
    def wait_for_connection(self):
        print(f"\n[CONN] Waiting for Go service to connect...")
        print(f"[CONN] (Start the Go service in another terminal: go run cmd/websocket_bridge.go)")
        
        while self.running:
            try:
                self.conn, addr = self.server_sock.accept()
                print(f"[CONN] ✓ Go service connected!")
                return True
            except socket.timeout:
                continue
            except Exception as e:
                print(f"[ERROR] ✗ Accept failed: {e}")
                return False
        return False
        
    def setup_bpf(self):
        print(f"\n[BPF] Setting up eBPF tracepoint...")
        print(f"[BPF] Target PID: {self.target_pid if self.target_pid != 0 else 'all processes'}")
        
        try:
            self.reconfigure_pid(self.target_pid)
            return True
        except Exception as e:
            print(f"\n[ERROR] ==================================================")
            print(f"[ERROR] ✗ Failed to attach eBPF tracepoint!")
            print(f"[ERROR] ==================================================")
            print(f"\nPossible causes:")
            print(f"  1. Insufficient privileges (run with sudo)")
            print(f"  2. Kernel version too old (need Linux 4.15+)")
            print(f"  3. Missing kernel headers")
            print(f"  4. Tracepoint sys_enter_openat not available")
            print(f"\nError details: {type(e).__name__}: {e}")
            print(f"\n[ERROR] ==================================================")
            return False
            
    def cleanup(self):
        print(f"\n[CLEANUP] Cleaning up resources...")
        
        if self.conn:
            try:
                self.conn.close()
                print(f"[CLEANUP] ✓ Client connection closed")
            except:
                pass
                
        if self.server_sock:
            try:
                self.server_sock.close()
                print(f"[CLEANUP] ✓ Server socket closed")
            except:
                pass
                
        if self.control_sock:
            try:
                self.control_sock.close()
                print(f"[CLEANUP] ✓ Control socket closed")
            except:
                pass
                
        if os.path.exists(SOCKET_PATH):
            try:
                os.remove(SOCKET_PATH)
                print(f"[CLEANUP] ✓ Socket file removed")
            except:
                pass
                
        if os.path.exists(CONTROL_SOCKET_PATH):
            try:
                os.remove(CONTROL_SOCKET_PATH)
                print(f"[CLEANUP] ✓ Control socket file removed")
            except:
                pass
                
        if self.bpf:
            try:
                self.bpf.cleanup()
                print(f"[CLEANUP] ✓ BPF resources released")
            except:
                pass
                
        print(f"[CLEANUP] ✓ Total events captured: {self.event_count}")
        
    def run(self):
        print("=" * 60)
        print("  System Call Monitor - eBPF Based")
        print("=" * 60)
        
        if os.geteuid() != 0:
            print("\n[WARNING] This script may require root privileges!")
            print("[WARNING] If you see permission errors, run with sudo.\n")
            
        self.running = True
        
        if not self.setup_socket():
            self.cleanup()
            sys.exit(1)
            
        if not self.setup_control_socket():
            self.cleanup()
            sys.exit(1)
            
        if not self.wait_for_connection():
            self.cleanup()
            sys.exit(1)
            
        if not self.setup_bpf():
            self.cleanup()
            sys.exit(1)
            
        print("\n" + "=" * 60)
        print("  Monitoring started! Press Ctrl+C to stop")
        print("=" * 60)
        print()
        
        try:
            while self.running:
                try:
                    with self.lock:
                        if self.bpf:
                            self.bpf.perf_buffer_poll(timeout=100)
                except KeyboardInterrupt:
                    break
        except Exception as e:
            print(f"\n[ERROR] Runtime error: {e}")
        finally:
            self.cleanup()
            
        print("\n[DONE] Monitor stopped.")


def main():
    if len(sys.argv) < 2:
        print("Usage: sudo python3 syscall_monitor.py <pid>")
        print()
        print("Arguments:")
        print("  pid    - Process ID to monitor (0 for all processes)")
        print()
        print("Examples:")
        print("  sudo python3 syscall_monitor.py 1234  # Monitor PID 1234")
        print("  sudo python3 syscall_monitor.py 0     # Monitor all processes")
        sys.exit(1)
    
    try:
        target_pid = int(sys.argv[1])
    except ValueError:
        print(f"[ERROR] Invalid PID: {sys.argv[1]}")
        sys.exit(1)
        
    if target_pid < 0:
        print(f"[ERROR] PID must be non-negative")
        sys.exit(1)
        
    monitor = SyscallMonitor(target_pid)
    monitor.run()


if __name__ == "__main__":
    main()

package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	socketPath        = "/tmp/syscall_monitor.sock"
	controlSocketPath = "/tmp/syscall_monitor_control.sock"
	wsAddr            = ":8080"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type SyscallEvent struct {
	PID       int    `json:"pid"`
	Comm      string `json:"comm"`
	Filename  string `json:"filename"`
	Timestamp string `json:"timestamp"`
}

type Client struct {
	conn *websocket.Conn
	send chan []byte
}

type Server struct {
	clients         map[*Client]bool
	broadcast       chan []byte
	register        chan *Client
	unregister      chan *Client
	mu              sync.RWMutex
	eventCount      uint64
	unixConn        net.Conn
	controlConn     net.Conn
	connectedToUnix bool
	currentPID      int
}

func newServer() *Server {
	return &Server{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte, 1000),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		currentPID: 0,
	}
}

func (s *Server) run() {
	for {
		select {
		case client := <-s.register:
			s.mu.Lock()
			s.clients[client] = true
			clientCount := len(s.clients)
			s.mu.Unlock()
			log.Printf("[WS] ✓ New client connected. Total clients: %d", clientCount)
		case client := <-s.unregister:
			s.mu.Lock()
			if _, ok := s.clients[client]; ok {
				delete(s.clients, client)
				close(client.send)
			}
			clientCount := len(s.clients)
			s.mu.Unlock()
			log.Printf("[WS] ✗ Client disconnected. Total clients: %d", clientCount)
		case message := <-s.broadcast:
			s.mu.RLock()
			for client := range s.clients {
				select {
				case client.send <- message:
				default:
					log.Printf("[WS] ✗ Client buffer full, disconnecting")
					close(client.send)
					delete(s.clients, client)
				}
			}
			s.mu.RUnlock()
		}
	}
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[WS] ✗ Upgrade failed: %v", err)
		return
	}
	client := &Client{conn: conn, send: make(chan []byte, 256)}
	s.register <- client

	defer func() {
		s.unregister <- client
		conn.Close()
	}()

	go client.writePump()
	client.readPump()
}

func (c *Client) readPump() {
	defer func() {
		c.conn.Close()
	}()
	for {
		_, _, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[WS] ✗ Read error: %v", err)
			}
			break
		}
	}
}

func (c *Client) writePump() {
	defer func() {
		c.conn.Close()
	}()
	for message := range c.send {
		err := c.conn.WriteMessage(websocket.TextMessage, message)
		if err != nil {
			log.Printf("[WS] ✗ Write error: %v", err)
			break
		}
	}
}

func (s *Server) connectToControlSocket() error {
	log.Printf("[CONTROL] Connecting to control socket...")
	conn, err := net.Dial("unix", controlSocketPath)
	if err != nil {
		return err
	}
	s.controlConn = conn
	log.Printf("[CONTROL] ✓ Connected to control socket")
	return nil
}

func (s *Server) sendControlCommand(command map[string]interface{}) (map[string]interface{}, error) {
	if s.controlConn == nil {
		if err := s.connectToControlSocket(); err != nil {
			return nil, fmt.Errorf("failed to connect to control socket: %v", err)
		}
	}

	data, err := json.Marshal(command)
	if err != nil {
		return nil, err
	}

	s.controlConn.SetDeadline(time.Now().Add(2 * time.Second))
	_, err = s.controlConn.Write(data)
	if err != nil {
		s.controlConn.Close()
		s.controlConn = nil
		return nil, err
	}

	buf := make([]byte, 1024)
	n, err := s.controlConn.Read(buf)
	if err != nil {
		s.controlConn.Close()
		s.controlConn = nil
		return nil, err
	}

	var response map[string]interface{}
	if err := json.Unmarshal(buf[:n], &response); err != nil {
		return nil, err
	}

	return response, nil
}

func (s *Server) handleSetPID(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		PID int `json:"pid"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	command := map[string]interface{}{
		"action": "set_pid",
		"pid":    req.PID,
	}

	response, err := s.sendControlCommand(command)
	if err != nil {
		log.Printf("[CONTROL] ✗ Failed to send set_pid command: %v", err)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "error",
			"error":  err.Error(),
		})
		return
	}

	s.currentPID = req.PID
	log.Printf("[CONTROL] ✓ PID set to %d", req.PID)
	json.NewEncoder(w).Encode(response)
}

func (s *Server) handleGetPID(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	command := map[string]interface{}{
		"action": "get_pid",
	}

	response, err := s.sendControlCommand(command)
	if err != nil {
		log.Printf("[CONTROL] ✗ Failed to send get_pid command: %v", err)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "error",
			"error":  err.Error(),
		})
		return
	}

	json.NewEncoder(w).Encode(response)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	status := map[string]interface{}{
		"connected_to_unix": s.connectedToUnix,
		"current_pid":       s.currentPID,
		"event_count":       s.eventCount,
		"client_count":      len(s.clients),
	}
	json.NewEncoder(w).Encode(status)
}

func (s *Server) connectToUnixSocket() error {
	log.Printf("[UNIX] Attempting to connect to %s...", socketPath)

	for attempt := 1; attempt <= 60; attempt++ {
		if _, err := os.Stat(socketPath); os.IsNotExist(err) {
			if attempt%5 == 0 {
				log.Printf("[UNIX] Waiting for socket file... (attempt %d/60)", attempt)
				log.Printf("[UNIX] Hint: Start the Python backend: sudo python3 backend/syscall_monitor.py <pid>")
			}
			time.Sleep(1 * time.Second)
			continue
		}

		conn, err := net.Dial("unix", socketPath)
		if err != nil {
			log.Printf("[UNIX] ✗ Connection attempt %d failed: %v", attempt, err)
			time.Sleep(1 * time.Second)
			continue
		}

		s.unixConn = conn
		s.connectedToUnix = true
		log.Printf("[UNIX] ✓ Successfully connected to Unix socket")
		return nil
	}

	return fmt.Errorf("failed to connect after 60 attempts")
}

func (s *Server) readFromUnixSocket() {
	for {
		if !s.connectedToUnix {
			err := s.connectToUnixSocket()
			if err != nil {
				log.Printf("[UNIX] ✗ %v", err)
				log.Printf("[UNIX] Retrying in 5 seconds...")
				time.Sleep(5 * time.Second)
				continue
			}
		}

		log.Printf("[UNIX] Reading events from socket...")
		scanner := bufio.NewScanner(s.unixConn)

		for scanner.Scan() {
			line := scanner.Bytes()

			var event SyscallEvent
			if err := json.Unmarshal(line, &event); err != nil {
				log.Printf("[UNIX] ✗ Failed to parse JSON: %v, line: %s", err, string(line))
				continue
			}

			jsonData, err := json.Marshal(event)
			if err != nil {
				log.Printf("[UNIX] ✗ Failed to marshal event: %v", err)
				continue
			}

			s.eventCount++
			if s.eventCount%10 == 0 {
				log.Printf("[UNIX] Forwarded %d events...", s.eventCount)
			}

			s.broadcast <- jsonData
		}

		if err := scanner.Err(); err != nil {
			log.Printf("[UNIX] ✗ Error reading from socket: %v", err)
		} else {
			log.Printf("[UNIX] ✗ Connection closed by Python backend")
		}

		s.connectedToUnix = false
		if s.unixConn != nil {
			s.unixConn.Close()
		}
		s.unixConn = nil
		log.Printf("[UNIX] Attempting to reconnect...")
		time.Sleep(2 * time.Second)
	}
}

func getStaticDir() string {
	cwd, err := os.Getwd()
	if err != nil {
		log.Printf("[WARN] Could not get working directory: %v", err)
		return "./frontend/dist"
	}

	pathsToTry := []string{
		filepath.Join(cwd, "frontend", "dist"),
		filepath.Join(cwd, "..", "frontend", "dist"),
		"./frontend/dist",
	}

	for _, p := range pathsToTry {
		if _, err := os.Stat(p); err == nil {
			log.Printf("[HTTP] Serving static files from: %s", p)
			return p
		}
	}

	log.Printf("[WARN] Frontend dist directory not found, running in API-only mode")
	log.Printf("[WARN] Build frontend with: cd frontend && npm install && npm run build")
	return ""
}

func main() {
	fmt.Println("=" + strings.Repeat("=", 58))
	fmt.Println("  System Call Monitor - WebSocket Bridge")
	fmt.Println("=" + strings.Repeat("=", 58))

	server := newServer()
	go server.run()

	go server.readFromUnixSocket()

	http.HandleFunc("/ws", server.handleWebSocket)
	http.HandleFunc("/api/set-pid", server.handleSetPID)
	http.HandleFunc("/api/get-pid", server.handleGetPID)
	http.HandleFunc("/api/health", server.handleHealth)

	staticDir := getStaticDir()
	if staticDir != "" {
		fs := http.FileServer(http.Dir(staticDir))
		http.Handle("/", fs)
	} else {
		http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/html")
			w.Write([]byte(`
<!DOCTYPE html>
<html>
<head>
    <title>System Call Monitor</title>
    <style>
        body { font-family: monospace; background: #1a1a2e; color: #eee; padding: 20px; }
        .container { max-width: 800px; margin: 0 auto; }
        h1 { color: #00d4ff; }
        .status { background: #16213e; padding: 15px; border-radius: 8px; margin: 20px 0; }
        .status.ok { border-left: 4px solid #2ed573; }
        .status.warn { border-left: 4px solid #ffa502; }
        code { background: #0f3460; padding: 2px 6px; border-radius: 4px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔍 System Call Monitor</h1>
        <div class="status warn">
            <strong>⚠️ Frontend not built</strong><br><br>
            Build the frontend first:<br>
            <code>cd frontend && npm install && npm run build</code>
        </div>
        <div class="status ok">
            <strong>WebSocket Endpoint:</strong> ws://localhost:8080/ws<br>
            <strong>API Endpoints:</strong><br>
            - POST /api/set-pid - Set monitoring PID<br>
            - GET /api/get-pid - Get current PID<br>
            - GET /api/health - Get status
        </div>
    </div>
</body>
</html>
			`))
		})
	}

	fmt.Println()
	log.Printf("[HTTP] WebSocket server starting on %s", wsAddr)
	log.Printf("[HTTP] Access: http://localhost%s", wsAddr)
	log.Printf("[HTTP] API Endpoints: /api/set-pid, /api/get-pid, /api/health")
	fmt.Println()
	log.Fatal(http.ListenAndServe(wsAddr, nil))
}

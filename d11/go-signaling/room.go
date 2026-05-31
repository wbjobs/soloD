package main

import (
	"encoding/json"
	"log"
	"sync"

	"github.com/gorilla/websocket"
)

type Client struct {
	conn     *websocket.Conn
	roomID   string
	username string
	send     chan []byte
}

type Room struct {
	clients map[*Client]bool
	locked  bool
	creator string
	mu      sync.RWMutex
}

var (
	rooms = make(map[string]*Room)
	mu    sync.RWMutex
)

func getOrCreateRoom(roomID string, creator string) *Room {
	mu.Lock()
	defer mu.Unlock()
	if _, ok := rooms[roomID]; !ok {
		rooms[roomID] = &Room{
			clients: make(map[*Client]bool),
			locked:  false,
			creator: creator,
		}
	}
	return rooms[roomID]
}

func (r *Room) setLocked(locked bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.locked = locked
}

func (r *Room) isLocked() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.locked
}

func (c *Client) readPump() {
	defer func() {
		c.disconnect()
	}()
	for {
		_, msg, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
			}
			break
		}
		c.handleMessage(msg)
	}
}

func (c *Client) writePump() {
	defer func() {
		c.conn.Close()
	}()
	for msg := range c.send {
		c.conn.WriteMessage(websocket.TextMessage, msg)
	}
}

func (c *Client) disconnect() {
	room := getOrCreateRoom(c.roomID, "")
	room.mu.Lock()
	if _, ok := room.clients[c]; ok {
		delete(room.clients, c)
		close(c.send)
		leaveMsg := Message{
			Type:     "user-left",
			Username: c.username,
		}
		broadcastToRoom(c.roomID, leaveMsg, c)
	}
	room.mu.Unlock()
	c.conn.Close()
}

func (c *Client) handleMessage(rawMsg []byte) {
	var msg Message
	if err := json.Unmarshal(rawMsg, &msg); err != nil {
		log.Printf("Failed to parse message: %v", err)
		return
	}

	room := getOrCreateRoom(c.roomID, "")

	switch msg.Type {
	case "offer", "answer", "ice-candidate":
		msg.Sender = c.username
		forwardToPeer(c.roomID, msg, msg.Target)
	case "draw":
		if room.isLocked() && c.username != room.creator {
			return
		}
		msg.Username = c.username
		broadcastToRoom(c.roomID, msg, c)
	case "lock-room":
		if c.username == room.creator {
			room.setLocked(true)
			lockMsg := Message{
				Type:   "room-locked",
				Locked: true,
			}
			broadcastToRoom(c.roomID, lockMsg, nil)
		}
	case "unlock-room":
		if c.username == room.creator {
			room.setLocked(false)
			unlockMsg := Message{
				Type:   "room-unlocked",
				Locked: false,
			}
			broadcastToRoom(c.roomID, unlockMsg, nil)
		}
	}
}

func broadcastToRoom(roomID string, msg Message, exclude *Client) {
	room := getOrCreateRoom(roomID, "")
	room.mu.RLock()
	defer room.mu.RUnlock()

	msgBytes, _ := json.Marshal(msg)
	for client := range room.clients {
		if client != exclude {
			select {
			case client.send <- msgBytes:
			default:
				close(client.send)
				delete(room.clients, client)
			}
		}
	}
}

func forwardToPeer(roomID string, msg Message, target string) {
	room := getOrCreateRoom(roomID, "")
	room.mu.RLock()
	defer room.mu.RUnlock()

	msgBytes, _ := json.Marshal(msg)
	for client := range room.clients {
		if client.username == target {
			select {
			case client.send <- msgBytes:
			default:
				close(client.send)
				delete(room.clients, client)
			}
			break
		}
	}
}

package main

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		http.Error(w, "Token required", http.StatusUnauthorized)
		return
	}

	roomID, username, err := verifyToken(token)
	if err != nil {
		http.Error(w, "Invalid token", http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}

	client := &Client{
		conn:     conn,
		roomID:   roomID,
		username: username,
		send:     make(chan []byte, 256),
	}

	room := getOrCreateRoom(roomID, username)
	room.mu.Lock()
	room.clients[client] = true
	if room.creator == "" {
		room.creator = username
	}
	room.mu.Unlock()

	joinMsg := Message{
		Type:     "user-joined",
		Username: username,
		Locked:   room.isLocked(),
		Creator:  room.creator,
	}
	broadcastToRoom(roomID, joinMsg, nil)

	go client.writePump()
	client.readPump()
}

func main() {
	http.HandleFunc("/ws", handleWebSocket)
	log.Println("Signaling server starting on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}

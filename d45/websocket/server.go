package websocket

import (
	"encoding/json"
	"fmt"
	"game-backend/matchmaker"
	"game-backend/models"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	HeartbeatInterval = 10 * time.Second
	HeartbeatTimeout  = 30 * time.Second
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Message struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

type Client struct {
	ID       string
	Conn     *websocket.Conn
	Player   *models.Player
	Send     chan []byte
	Server   *Server
	lastPong time.Time
	mu       sync.Mutex
}

type Server struct {
	clients    map[string]*Client
	players    map[string]*models.Player
	clientsMux sync.RWMutex
	matchmaker *matchmaker.Matchmaker
	upgrader   websocket.Upgrader
}

func NewServer(mm *matchmaker.Matchmaker) *Server {
	s := &Server{
		clients:    make(map[string]*Client),
		players:    make(map[string]*models.Player),
		matchmaker: mm,
		upgrader:   upgrader,
	}
	go s.runCleanupLoop()
	return s
}

func (s *Server) runCleanupLoop() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		s.cleanupStaleQueueEntries()
	}
}

func (s *Server) cleanupStaleQueueEntries() {
	s.clientsMux.RLock()
	onlineIDs := make(map[string]bool)
	for id := range s.clients {
		onlineIDs[id] = true
	}
	s.clientsMux.RUnlock()

	removed := s.matchmaker.CleanupStalePlayers(onlineIDs)
	if removed > 0 {
		fmt.Printf("清理了 %d 个离线玩家从匹配队列\n", removed)
	}
}

func (s *Server) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := s.upgrader.Upgrade(w, r, nil)
	if err != nil {
		fmt.Printf("WebSocket upgrade error: %v\n", err)
		return
	}

	playerID := r.URL.Query().Get("playerId")
	playerName := r.URL.Query().Get("name")
	if playerID == "" {
		playerID = fmt.Sprintf("player_%d", time.Now().UnixNano())
	}
	if playerName == "" {
		playerName = "Anonymous"
	}

	s.clientsMux.Lock()

	if existingClient, exists := s.clients[playerID]; exists {
		fmt.Printf("玩家 %s 正在重连，关闭旧连接\n", playerID)
		existingClient.Conn.Close()
		close(existingClient.Send)
	}

	var player *models.Player
	if existingPlayer, exists := s.players[playerID]; exists {
		player = existingPlayer
		fmt.Printf("玩家 %s 重连成功，复用原有Player对象 (InQueue: %v)\n", playerID, player.InQueue)
		
		if player.InQueue {
			fmt.Printf("玩家 %s 之前在匹配队列中，已自动重置状态\n", playerID)
			player.InQueue = false
		}
	} else {
		player = models.NewPlayer(playerID, playerName, 1000.0)
		s.players[playerID] = player
		fmt.Printf("新玩家注册: %s (%s)\n", playerID, playerName)
	}

	client := &Client{
		ID:       playerID,
		Conn:     conn,
		Player:   player,
		Send:     make(chan []byte, 256),
		Server:   s,
		lastPong: time.Now(),
	}

	s.clients[playerID] = client
	s.clientsMux.Unlock()

	go client.readPump()
	go client.writePump()

	reconnectMsg := Message{
		Type: "reconnect_success",
		Payload: map[string]interface{}{
			"playerId": playerID,
			"name":     player.Name,
			"elo":      player.GetElo(),
			"inQueue":  player.InQueue,
		},
	}
	reconnectBytes, _ := json.Marshal(reconnectMsg)
	client.Send <- reconnectBytes
}

func (s *Server) removeClient(clientID string) {
	s.clientsMux.Lock()
	defer s.clientsMux.Unlock()

	if client, exists := s.clients[clientID]; exists {
		s.matchmaker.RemoveFromQueue(clientID)
		close(client.Send)
		delete(s.clients, clientID)
		fmt.Printf("客户端断开连接: %s\n", clientID)
	}
}

func (s *Server) GetClient(playerID string) (*Client, bool) {
	s.clientsMux.RLock()
	defer s.clientsMux.RUnlock()
	client, exists := s.clients[playerID]
	return client, exists
}

func (c *Client) readPump() {
	defer func() {
		c.Server.removeClient(c.ID)
		c.Conn.Close()
	}()

	c.Conn.SetPongHandler(func(string) error {
		c.mu.Lock()
		c.lastPong = time.Now()
		c.mu.Unlock()
		return nil
	})

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				fmt.Printf("WebSocket read error: %v\n", err)
			}
			break
		}

		var msg Message
		if err := json.Unmarshal(message, &msg); err != nil {
			fmt.Printf("JSON parse error: %v\n", err)
			continue
		}

		c.handleMessage(msg)
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(HeartbeatInterval)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			c.Conn.WriteMessage(websocket.TextMessage, message)

		case <-ticker.C:
			c.mu.Lock()
			if time.Since(c.lastPong) > HeartbeatTimeout {
				c.mu.Unlock()
				fmt.Printf("客户端心跳超时: %s，主动断开连接\n", c.ID)
				c.Server.removeClient(c.ID)
				return
			}
			c.mu.Unlock()

			heartbeatMsg := Message{
				Type: "heartbeat",
				Payload: map[string]interface{}{
					"timestamp": time.Now().Unix(),
				},
			}
			heartbeatBytes, _ := json.Marshal(heartbeatMsg)
			c.Send <- heartbeatBytes
		}
	}
}

func (c *Client) handleMessage(msg Message) {
	switch msg.Type {
	case "join_queue":
		success := c.Server.matchmaker.AddToQueue(c.Player)
		if success {
			response := Message{
				Type: "queue_joined",
				Payload: map[string]interface{}{
					"playerId": c.ID,
					"elo":      c.Player.GetElo(),
				},
			}
			responseBytes, _ := json.Marshal(response)
			c.Send <- responseBytes
		}

	case "leave_queue":
		c.Server.matchmaker.RemoveFromQueue(c.ID)
		response := Message{
			Type: "queue_left",
			Payload: map[string]interface{}{
				"playerId": c.ID,
			},
		}
		responseBytes, _ := json.Marshal(response)
		c.Send <- responseBytes

	case "pong":
		c.mu.Lock()
		c.lastPong = time.Now()
		c.mu.Unlock()
	}
}

func (s *Server) BroadcastMatchFound(match *models.Match) {
	payload := map[string]interface{}{
		"matchId": match.ID,
		"playerA": map[string]interface{}{
			"id":   match.PlayerA.ID,
			"name": match.PlayerA.Name,
			"elo":  match.PlayerA.GetElo(),
		},
		"playerB": map[string]interface{}{
			"id":   match.PlayerB.ID,
			"name": match.PlayerB.Name,
			"elo":  match.PlayerB.GetElo(),
		},
	}

	msgA := Message{
		Type: "match_found",
		Payload: map[string]interface{}{
			"match":  payload,
			"opponent": payload["playerB"],
			"you":      payload["playerA"],
		},
	}

	msgB := Message{
		Type: "match_found",
		Payload: map[string]interface{}{
			"match":  payload,
			"opponent": payload["playerA"],
			"you":      payload["playerB"],
		},
	}

	if clientA, exists := s.GetClient(match.PlayerA.ID); exists {
		msgBytes, _ := json.Marshal(msgA)
		clientA.Send <- msgBytes
	}

	if clientB, exists := s.GetClient(match.PlayerB.ID); exists {
		msgBytes, _ := json.Marshal(msgB)
		clientB.Send <- msgBytes
	}
}

func (s *Server) HandleSpectatorWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		fmt.Printf("WebSocket upgrade error: %v\n", err)
		return
	}

	matchID := r.URL.Query().Get("matchId")
	spectatorID := r.URL.Query().Get("spectatorId")
	spectatorName := r.URL.Query().Get("name")

	if matchID == "" {
		conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"error","payload":{"message":"matchId is required"}}`))
		conn.Close()
		return
	}

	if spectatorID == "" {
		spectatorID = fmt.Sprintf("spectator_%d", time.Now().UnixNano())
	}
	if spectatorName == "" {
		spectatorName = "Anonymous"
	}

	match, matchExists := s.matchmaker.GetMatch(matchID)
	if !matchExists {
		errorMsg := map[string]interface{}{
			"type": "error",
			"payload": map[string]interface{}{
				"message": "Match not found",
				"matchId": matchID,
			},
		}
		errorBytes, _ := json.Marshal(errorMsg)
		conn.WriteMessage(websocket.TextMessage, errorBytes)
		conn.Close()
		return
	}

	spectator := models.NewSpectator(spectatorID, spectatorName)
	added := match.AddSpectator(spectator)
	
	if !added {
		conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"error","payload":{"message":"Failed to join as spectator"}}`))
		conn.Close()
		return
	}

	fmt.Printf("观战者 %s (%s) 加入比赛 %s，当前观战人数: %d\n", 
		spectatorName, spectatorID, matchID, match.GetSpectatorCount())

	welcomeMsg := map[string]interface{}{
		"type": "spectator_joined",
		"payload": map[string]interface{}{
			"matchId":         matchID,
			"spectatorId":     spectatorID,
			"spectatorName":   spectatorName,
			"spectatorCount":  match.GetSpectatorCount(),
			"match":           s.matchmaker.GetMatchInfo(matchID),
		},
	}
	welcomeBytes, _ := json.Marshal(welcomeMsg)
	spectator.Send <- welcomeBytes

	go func() {
		defer func() {
			match.RemoveSpectator(spectatorID)
			conn.Close()
			fmt.Printf("观战者 %s 离开比赛 %s，当前观战人数: %d\n", 
				spectatorID, matchID, match.GetSpectatorCount())
		}()

		for {
			_, _, err := conn.ReadMessage()
			if err != nil {
				break
			}
		}
	}()

	go func() {
		defer conn.Close()
		
		for message := range spectator.Send {
			err := conn.WriteMessage(websocket.TextMessage, message)
			if err != nil {
				break
			}
		}
	}()
}

func (s *Server) BroadcastGameEvent(matchID string, eventType string, payload interface{}) {
	message := models.MatchMessage{
		Type:      eventType,
		MatchID:   matchID,
		Timestamp: time.Now().Unix(),
		Payload:   payload,
	}
	
	messageBytes, err := json.Marshal(message)
	if err != nil {
		fmt.Printf("序列化比赛消息失败: %v\n", err)
		return
	}
	
	s.matchmaker.BroadcastMatchMessage(matchID, messageBytes)
	
	if clientA, exists := s.GetClient(message.MatchID + "_playerA"); exists {
		select {
		case clientA.Send <- messageBytes:
		default:
		}
	}
	if clientB, exists := s.GetClient(message.MatchID + "_playerB"); exists {
		select {
		case clientB.Send <- messageBytes:
		default:
		}
	}
}

func (s *Server) StartMatchSimulation(matchID string) {
	match, exists := s.matchmaker.GetMatch(matchID)
	if !exists {
		return
	}
	
	fmt.Printf("开始模拟比赛: %s\n", matchID)
	
	go func() {
		ticker := time.NewTicker(2 * time.Second)
		defer ticker.Stop()
		
		eventCount := 0
		
		for range ticker.C {
			eventCount++
			
			currentMatch, stillExists := s.matchmaker.GetMatch(matchID)
			if !stillExists || currentMatch == nil {
				fmt.Printf("比赛已结束，停止模拟: %s\n", matchID)
				return
			}
			
			var eventType string
			var payload map[string]interface{}
			
			switch eventCount % 5 {
			case 1:
				eventType = "move"
				payload = map[string]interface{}{
					"playerId": match.PlayerA.ID,
					"playerName": match.PlayerA.Name,
					"action": "moved to position",
					"position": eventCount,
				}
			case 2:
				eventType = "attack"
				payload = map[string]interface{}{
					"playerId": match.PlayerB.ID,
					"playerName": match.PlayerB.Name,
					"action": "launched attack",
					"damage": 10 + eventCount,
				}
			case 3:
				eventType = "defense"
				payload = map[string]interface{}{
					"playerId": match.PlayerA.ID,
					"playerName": match.PlayerA.Name,
					"action": "blocked attack",
					"defenseValue": 8 + eventCount/2,
				}
			case 4:
				eventType = "score_update"
				payload = map[string]interface{}{
					match.PlayerA.ID: eventCount,
					match.PlayerB.ID: eventCount - 1,
				}
			default:
				eventType = "game_status"
				payload = map[string]interface{}{
					"status": "in_progress",
					"duration": eventCount * 2,
					"spectatorCount": currentMatch.GetSpectatorCount(),
				}
			}
			
			s.BroadcastGameEvent(matchID, eventType, payload)
			
			if eventCount >= 20 {
				s.BroadcastGameEvent(matchID, "game_end", map[string]interface{}{
					"winnerId": match.PlayerA.ID,
					"winnerName": match.PlayerA.Name,
					"finalScore": map[string]int{
						match.PlayerA.ID: 100,
						match.PlayerB.ID: 85,
					},
				})
				fmt.Printf("比赛模拟结束: %s\n", matchID)
				return
			}
		}
	}()
}

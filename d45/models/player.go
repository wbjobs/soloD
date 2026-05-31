package models

import (
	"math"
	"sync"
	"time"
)

type Player struct {
	ID        string
	Elo       float64
	Name      string
	InQueue   bool
	Conn      interface{}
	mu        sync.RWMutex
}

func NewPlayer(id, name string, elo float64) *Player {
	return &Player{
		ID:   id,
		Name: name,
		Elo:  elo,
	}
}

func (p *Player) GetElo() float64 {
	p.mu.RLock()
	defer p.mu.RUnlock()
	return p.Elo
}

func (p *Player) SetElo(elo float64) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.Elo = elo
}

func CalculateEloChange(playerA, playerB *Player, winner string) (float64, float64) {
	expectedA := 1.0 / (1.0 + math.Pow(10, (playerB.GetElo()-playerA.GetElo())/400))
	expectedB := 1.0 / (1.0 + math.Pow(10, (playerA.GetElo()-playerB.GetElo())/400))

	var scoreA, scoreB float64
	if winner == playerA.ID {
		scoreA = 1.0
		scoreB = 0.0
	} else if winner == playerB.ID {
		scoreA = 0.0
		scoreB = 1.0
	} else {
		scoreA = 0.5
		scoreB = 0.5
	}

	k := 32.0
	changeA := k * (scoreA - expectedA)
	changeB := k * (scoreB - expectedB)

	return changeA, changeB
}

func UpdateEloRatings(playerA, playerB *Player, winner string) {
	changeA, changeB := CalculateEloChange(playerA, playerB, winner)
	playerA.SetElo(playerA.GetElo() + changeA)
	playerB.SetElo(playerB.GetElo() + changeB)
}

type Spectator struct {
	ID   string
	Name string
	Send chan []byte
}

func NewSpectator(id, name string) *Spectator {
	return &Spectator{
		ID:   id,
		Name: name,
		Send: make(chan []byte, 256),
	}
}

type MatchMessage struct {
	Type      string      `json:"type"`
	MatchID   string      `json:"matchId"`
	Timestamp int64       `json:"timestamp"`
	Payload   interface{} `json:"payload"`
}

type Match struct {
	ID         string
	PlayerA    *Player
	PlayerB    *Player
	CreatedAt  time.Time
	Spectators map[string]*Spectator
	spectatorMu sync.RWMutex
}

func NewMatch(id string, playerA, playerB *Player) *Match {
	return &Match{
		ID:         id,
		PlayerA:    playerA,
		PlayerB:    playerB,
		CreatedAt:  time.Now(),
		Spectators: make(map[string]*Spectator),
	}
}

func (m *Match) AddSpectator(spectator *Spectator) bool {
	m.spectatorMu.Lock()
	defer m.spectatorMu.Unlock()
	if _, exists := m.Spectators[spectator.ID]; exists {
		return false
	}
	m.Spectators[spectator.ID] = spectator
	return true
}

func (m *Match) RemoveSpectator(spectatorID string) bool {
	m.spectatorMu.Lock()
	defer m.spectatorMu.Unlock()
	if spectator, exists := m.Spectators[spectatorID]; exists {
		close(spectator.Send)
		delete(m.Spectators, spectatorID)
		return true
	}
	return false
}

func (m *Match) GetSpectatorCount() int {
	m.spectatorMu.RLock()
	defer m.spectatorMu.RUnlock()
	return len(m.Spectators)
}

func (m *Match) BroadcastToSpectators(message []byte) {
	m.spectatorMu.RLock()
	defer m.spectatorMu.RUnlock()
	
	for _, spectator := range m.Spectators {
		select {
		case spectator.Send <- message:
		default:
			close(spectator.Send)
			delete(m.Spectators, spectator.ID)
		}
	}
}

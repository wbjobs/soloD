package matchmaker

import (
	"fmt"
	"game-backend/models"
	"math"
	"sort"
	"sync"
	"time"

	"github.com/google/uuid"
)

type Matchmaker struct {
	queue        []*models.Player
	queueMutex   sync.RWMutex
	activeMatches map[string]*models.Match
	matchMutex   sync.RWMutex
	matchChan    chan *models.Match
}

func NewMatchmaker() *Matchmaker {
	m := &Matchmaker{
		queue:         make([]*models.Player, 0),
		activeMatches: make(map[string]*models.Match),
		matchChan:     make(chan *models.Match, 100),
	}
	go m.runMatchingLoop()
	return m
}

func (m *Matchmaker) AddToQueue(player *models.Player) bool {
	m.queueMutex.Lock()
	defer m.queueMutex.Unlock()

	for _, p := range m.queue {
		if p.ID == player.ID {
			return false
		}
	}

	player.InQueue = true
	m.queue = append(m.queue, player)
	fmt.Printf("玩家 %s 加入匹配队列，当前队列人数: %d\n", player.ID, len(m.queue))
	return true
}

func (m *Matchmaker) RemoveFromQueue(playerID string) bool {
	m.queueMutex.Lock()
	defer m.queueMutex.Unlock()

	for i, p := range m.queue {
		if p.ID == playerID {
			p.InQueue = false
			m.queue = append(m.queue[:i], m.queue[i+1:]...)
			fmt.Printf("玩家 %s 离开匹配队列\n", playerID)
			return true
		}
	}
	return false
}

func (m *Matchmaker) GetQueueSize() int {
	m.queueMutex.RLock()
	defer m.queueMutex.RUnlock()
	return len(m.queue)
}

func (m *Matchmaker) GetMatchChan() <-chan *models.Match {
	return m.matchChan
}

func (m *Matchmaker) runMatchingLoop() {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for range ticker.C {
		m.tryMatchPlayers()
	}
}

func (m *Matchmaker) tryMatchPlayers() {
	m.queueMutex.Lock()
	defer m.queueMutex.Unlock()

	if len(m.queue) < 2 {
		return
	}

	sort.Slice(m.queue, func(i, j int) bool {
		return m.queue[i].GetElo() < m.queue[j].GetElo()
	})

	matched := make(map[int]bool)

	for i := 0; i < len(m.queue)-1; i++ {
		if matched[i] {
			continue
		}

		playerA := m.queue[i]
		bestMatchIndex := -1
		bestEloDiff := math.MaxFloat64

		for j := i + 1; j < len(m.queue); j++ {
			if matched[j] {
				continue
			}

			playerB := m.queue[j]
			eloDiff := math.Abs(playerA.GetElo() - playerB.GetElo())

			maxAllowedDiff := 100.0

			if eloDiff <= maxAllowedDiff && eloDiff < bestEloDiff {
				bestEloDiff = eloDiff
				bestMatchIndex = j
			}
		}

		if bestMatchIndex != -1 {
			playerB := m.queue[bestMatchIndex]

			matched[i] = true
			matched[bestMatchIndex] = true

			matchID := uuid.New().String()
			match := models.NewMatch(matchID, playerA, playerB)

			playerA.InQueue = false
			playerB.InQueue = false

			m.matchMutex.Lock()
			m.activeMatches[matchID] = match
			m.matchMutex.Unlock()

			m.matchChan <- match

			fmt.Printf("匹配成功! 比赛ID: %s\n玩家A: %s (Elo: %.1f) vs 玩家B: %s (Elo: %.1f)\n",
				matchID, playerA.Name, playerA.GetElo(), playerB.Name, playerB.GetElo())
		}
	}

	newQueue := make([]*models.Player, 0)
	for i, p := range m.queue {
		if !matched[i] {
			newQueue = append(newQueue, p)
		}
	}
	m.queue = newQueue
}

func (m *Matchmaker) GetMatch(matchID string) (*models.Match, bool) {
	m.matchMutex.RLock()
	defer m.matchMutex.RUnlock()
	match, exists := m.activeMatches[matchID]
	return match, exists
}

func (m *Matchmaker) EndMatch(matchID string) {
	m.matchMutex.Lock()
	defer m.matchMutex.Unlock()
	delete(m.activeMatches, matchID)
}

func (m *Matchmaker) ForceRemovePlayer(playerID string) bool {
	m.queueMutex.Lock()
	defer m.queueMutex.Unlock()

	for i, p := range m.queue {
		if p.ID == playerID {
			p.InQueue = false
			m.queue = append(m.queue[:i], m.queue[i+1:]...)
			fmt.Printf("玩家 %s 被强制移出匹配队列\n", playerID)
			return true
		}
	}
	return false
}

func (m *Matchmaker) CleanupStalePlayers(onlinePlayerIDs map[string]bool) int {
	m.queueMutex.Lock()
	defer m.queueMutex.Unlock()

	removed := 0
	newQueue := make([]*models.Player, 0)

	for _, p := range m.queue {
		if onlinePlayerIDs[p.ID] {
			newQueue = append(newQueue, p)
		} else {
			p.InQueue = false
			removed++
			fmt.Printf("清理离线玩家 %s 从匹配队列\n", p.ID)
		}
	}

	m.queue = newQueue
	return removed
}

func (m *Matchmaker) GetAllMatches() []*models.Match {
	m.matchMutex.RLock()
	defer m.matchMutex.RUnlock()
	
	matches := make([]*models.Match, 0, len(m.activeMatches))
	for _, match := range m.activeMatches {
		matches = append(matches, match)
	}
	return matches
}

func (m *Matchmaker) BroadcastMatchMessage(matchID string, message []byte) bool {
	m.matchMutex.RLock()
	match, exists := m.activeMatches[matchID]
	m.matchMutex.RUnlock()
	
	if !exists {
		return false
	}
	
	match.BroadcastToSpectators(message)
	return true
}

func (m *Matchmaker) GetMatchInfo(matchID string) map[string]interface{} {
	m.matchMutex.RLock()
	defer m.matchMutex.RUnlock()
	
	match, exists := m.activeMatches[matchID]
	if !exists {
		return nil
	}
	
	return map[string]interface{}{
		"matchId":       match.ID,
		"createdAt":     match.CreatedAt,
		"playerA":       map[string]interface{}{"id": match.PlayerA.ID, "name": match.PlayerA.Name, "elo": match.PlayerA.GetElo()},
		"playerB":       map[string]interface{}{"id": match.PlayerB.ID, "name": match.PlayerB.Name, "elo": match.PlayerB.GetElo()},
		"spectatorCount": match.GetSpectatorCount(),
	}
}

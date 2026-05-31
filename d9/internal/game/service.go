package game

import (
	"log"
	"math/rand"
	"sort"
	"sync"
	"time"

	"github.com/cardgame/internal/db"
	"github.com/cardgame/internal/models"
	"github.com/cardgame/proto"
)

type GameService struct {
	proto.UnimplementedGameServiceServer
	games map[string]*Game
	mu    sync.RWMutex
}

type Game struct {
	MatchID     string
	Player1     *PlayerState
	Player2     *PlayerState
	CurrentTurn string
	TurnNumber  int
	Status      string
	WinnerID    string
	IsAIGame    bool
	Streams     map[string]chan *proto.GameEvent
	mu          sync.RWMutex
}

type PlayerState struct {
	UserID   string
	Health   int
	Mana     int
	MaxMana  int
	Hand     []models.Card
	Field    []models.Card
	Deck     []models.Card
	Username string
	IsAI     bool
}

func NewGameService() *GameService {
	return &GameService{
		games: make(map[string]*Game),
	}
}

func (s *GameService) getOrCreateGame(matchID, playerID string, isAIGame bool) *Game {
	s.mu.Lock()
	defer s.mu.Unlock()

	if game, exists := s.games[matchID]; exists {
		return game
	}

	var username string
	db.DB.QueryRow("SELECT username FROM users WHERE id = $1", playerID).Scan(&username)

	game := &Game{
		MatchID:     matchID,
		CurrentTurn: playerID,
		TurnNumber:  1,
		Status:      "playing",
		IsAIGame:    isAIGame,
		Streams:     make(map[string]chan *proto.GameEvent),
	}

	game.Player1 = &PlayerState{
		UserID:   playerID,
		Health:   30,
		Mana:     1,
		MaxMana:  1,
		Hand:     []models.Card{},
		Field:    []models.Card{},
		Deck:     models.GenerateDeck(),
		Username: username,
		IsAI:     false,
	}

	aiID := "ai_" + matchID[:8]
	game.Player2 = &PlayerState{
		UserID:   aiID,
		Health:   30,
		Mana:     1,
		MaxMana:  1,
		Hand:     []models.Card{},
		Field:    []models.Card{},
		Deck:     models.GenerateDeck(),
		Username: "AI Opponent",
		IsAI:     true,
	}

	for i := 0; i < 3; i++ {
		s.drawCard(game.Player1)
		s.drawCard(game.Player2)
	}

	s.games[matchID] = game
	return game
}

func (s *GameService) drawCard(player *PlayerState) bool {
	if len(player.Deck) == 0 {
		return false
	}
	card := player.Deck[0]
	player.Deck = player.Deck[1:]
	player.Hand = append(player.Hand, card)
	return true
}

func (s *GameService) ConnectGame(req *proto.ConnectGameRequest, stream proto.GameService_ConnectGameServer) error {
	log.Printf("Player %s connecting to game %s", req.UserId, req.MatchId)

	readyKey := "match_ready:" + req.UserId
	matchInfo, err := db.RedisClient.HGetAll(db.Ctx, readyKey).Result()
	if err != nil {
		return err
	}

	isAIGame := matchInfo["is_ai"] == "true"
	game := s.getOrCreateGame(req.MatchId, req.UserId, isAIGame)

	eventChan := make(chan *proto.GameEvent, 20)
	game.mu.Lock()
	game.Streams[req.UserId] = eventChan
	game.mu.Unlock()

	defer func() {
		game.mu.Lock()
		delete(game.Streams, req.UserId)
		game.mu.Unlock()
		close(eventChan)
	}()

	gameEvent := &proto.GameEvent{
		Type:    "game_start",
		Message: "Game has started!",
		State:   s.deepCopyGameState(game),
	}
	s.broadcastEvent(game, gameEvent)

	if isAIGame && game.Player2.IsAI {
		go s.aiTurnLoop(game)
	}

	for {
		select {
		case event := <-eventChan:
			if err := stream.Send(event); err != nil {
				log.Printf("Stream error for user %s: %v", req.UserId, err)
				return err
			}
		case <-stream.Context().Done():
			log.Printf("Player %s disconnected", req.UserId)
			return nil
		}
	}
}

func (s *GameService) ReconnectGame(ctx *proto.ReconnectGameRequest) (*proto.ReconnectGameResponse, error) {
	log.Printf("Reconnect request from user: %s", req.UserId)

	var matchID string
	err := db.DB.QueryRow(`
		SELECT match_id FROM user_active_games
		WHERE user_id = $1
	`, req.UserId).Scan(&matchID)
	if err != nil {
		return &proto.ReconnectGameResponse{
			Success: false,
			Message: "No active game found",
		}, nil
	}

	s.mu.RLock()
	game, exists := s.games[matchID]
	s.mu.RUnlock()

	if !exists {
		return &proto.ReconnectGameResponse{
			Success: false,
			Message: "Game no longer exists",
		}, nil
	}

	return &proto.ReconnectGameResponse{
		Success: true,
		Message: "Reconnected successfully",
		MatchId: matchID,
		State:   s.deepCopyGameState(game),
	}, nil
}

func (s *GameService) GetActiveGame(ctx *proto.GetActiveGameRequest) (*proto.GetActiveGameResponse, error) {
	var matchID string
	err := db.DB.QueryRow(`
		SELECT match_id FROM user_active_games
		WHERE user_id = $1
	`, req.UserId).Scan(&matchID)
	if err != nil {
		return &proto.GetActiveGameResponse{
			HasActiveGame: false,
		}, nil
	}

	s.mu.RLock()
	game, exists := s.games[matchID]
	s.mu.RUnlock()

	if !exists {
		return &proto.GetActiveGameResponse{
			HasActiveGame: false,
		}, nil
	}

	return &proto.GetActiveGameResponse{
		HasActiveGame: true,
		MatchId:       matchID,
		State:         s.deepCopyGameState(game),
	}, nil
}

func (s *GameService) broadcastEvent(game *Game, event *proto.GameEvent) {
	game.mu.RLock()
	defer game.mu.RUnlock()

	for _, ch := range game.Streams {
		select {
		case ch <- event:
		default:
			log.Printf("Warning: event channel full, dropping event")
		}
	}
}

func (s *GameService) deepCopyGameState(game *Game) *proto.GameState {
	return &proto.GameState{
		MatchId:      game.MatchID,
		CurrentPlayerId: game.CurrentTurn,
		TurnNumber:   int32(game.TurnNumber),
		Player1:      s.deepCopyPlayerState(game.Player1),
		Player2:      s.deepCopyPlayerState(game.Player2),
		GameStatus:   game.Status,
		WinnerId:     game.WinnerID,
		IsAIGame:     game.IsAIGame,
	}
}

func (s *GameService) deepCopyPlayerState(p *PlayerState) *proto.PlayerState {
	hand := make([]*proto.Card, len(p.Hand))
	for i, c := range p.Hand {
		hand[i] = s.copyCard(&c)
	}

	field := make([]*proto.Card, len(p.Field))
	for i, c := range p.Field {
		field[i] = s.copyCard(&c)
	}

	deck := make([]*proto.Card, len(p.Deck))
	for i, c := range p.Deck {
		deck[i] = s.copyCard(&c)
	}

	return &proto.PlayerState{
		UserId:  p.UserID,
		Health:  int32(p.Health),
		Mana:    int32(p.Mana),
		MaxMana: int32(p.MaxMana),
		Hand:    hand,
		Field:   field,
		Deck:    deck,
		Username: p.Username,
		IsAi:    p.IsAI,
	}
}

func (s *GameService) copyCard(c *models.Card) *proto.Card {
	return &proto.Card{
		Id:          c.ID,
		Name:        c.Name,
		Cost:        int32(c.Cost),
		Attack:      int32(c.Attack),
		Health:      int32(c.Health),
		Effect:      c.Effect,
		Description: c.Description,
	}
}

func (s *GameService) PlayCard(ctx context.Context, req *proto.PlayCardRequest) (*proto.PlayCardResponse, error) {
	s.mu.RLock()
	game, exists := s.games[req.MatchId]
	s.mu.RUnlock()

	if !exists {
		return &proto.PlayCardResponse{Success: false, Message: "Game not found"}, nil
	}

	game.mu.Lock()
	defer game.mu.Unlock()

	if game.Status != "playing" {
		return &proto.PlayCardResponse{Success: false, Message: "Game has ended"}, nil
	}

	if game.CurrentTurn != req.UserId {
		return &proto.PlayCardResponse{Success: false, Message: "Not your turn"}, nil
	}

	player := s.getPlayerState(game, req.UserId)
	if player == nil {
		return &proto.PlayCardResponse{Success: false, Message: "Player not found"}, nil
	}

	cardIndex := -1
	var card models.Card
	for i, c := range player.Hand {
		if c.ID == req.CardId {
			cardIndex = i
			card = c
			break
		}
	}

	if cardIndex == -1 {
		return &proto.PlayCardResponse{Success: false, Message: "Card not in hand"}, nil
	}

	if card.Cost > player.Mana {
		return &proto.PlayCardResponse{Success: false, Message: "Not enough mana"}, nil
	}

	player.Hand = append(player.Hand[:cardIndex], player.Hand[cardIndex+1:]...)
	player.Mana -= card.Cost
	player.Field = append(player.Field, card)

	s.applyCardEffect(game, player, card)

	s.cleanupDeadMinionsAll(game)

	s.checkGameEnd(game)

	gameEvent := &proto.GameEvent{
		Type:    "card_played",
		Message: player.Username + " played " + card.Name,
		State:   s.deepCopyGameState(game),
	}
	s.broadcastEvent(game, gameEvent)

	return &proto.PlayCardResponse{Success: true, Message: "Card played"}, nil
}

func (s *GameService) applyCardEffect(game *Game, player *PlayerState, card models.Card) {
	opponent := s.getOpponentState(game, player.UserID)

	switch card.Effect {
	case "spell_damage":
		if len(opponent.Field) > 0 {
			opponent.Field[0].Health -= 2
		} else {
			opponent.Health -= 2
		}
	case "heal":
		player.Health += 2
		if player.Health > 30 {
			player.Health = 30
		}
	}
}

func (s *GameService) getPlayerState(game *Game, userID string) *PlayerState {
	if game.Player1.UserID == userID {
		return game.Player1
	}
	if game.Player2.UserID == userID {
		return game.Player2
	}
	return nil
}

func (s *GameService) getOpponentState(game *Game, userID string) *PlayerState {
	if game.Player1.UserID == userID {
		return game.Player2
	}
	return game.Player1
}

func (s *GameService) EndTurn(ctx context.Context, req *proto.EndTurnRequest) (*proto.EndTurnResponse, error) {
	s.mu.RLock()
	game, exists := s.games[req.MatchId]
	s.mu.RUnlock()

	if !exists {
		return &proto.EndTurnResponse{Success: false, Message: "Game not found"}, nil
	}

	game.mu.Lock()
	defer game.mu.Unlock()

	if game.Status != "playing" {
		return &proto.EndTurnResponse{Success: false, Message: "Game has ended"}, nil
	}

	if game.CurrentTurn != req.UserId {
		return &proto.EndTurnResponse{Success: false, Message: "Not your turn"}, nil
	}

	s.endTurnEffects(game, req.UserId)

	s.cleanupDeadMinionsAll(game)

	s.checkGameEnd(game)

	opponent := s.getOpponentState(game, req.UserId)
	gameEvent := &proto.GameEvent{
		Type:    "turn_ended",
		Message: opponent.Username + "'s turn",
		State:   s.deepCopyGameState(game),
	}
	s.broadcastEvent(game, gameEvent)

	return &proto.EndTurnResponse{Success: true, Message: "Turn ended"}, nil
}

func (s *GameService) endTurnEffects(game *Game, currentPlayerID string) {
	player := s.getPlayerState(game, currentPlayerID)
	opponent := s.getOpponentState(game, currentPlayerID)

	for _, card := range player.Field {
		if card.Effect == "burn" {
			if len(opponent.Field) > 0 {
				opponent.Field[0].Health -= 1
			} else {
				opponent.Health -= 1
			}
		}
	}

	if opponent.MaxMana < 10 {
		opponent.MaxMana++
	}
	opponent.Mana = opponent.MaxMana

	s.drawCard(opponent)

	for _, card := range opponent.Field {
		if card.Effect == "burn" {
			if len(player.Field) > 0 {
				player.Field[0].Health -= 1
			} else {
				player.Health -= 1
			}
		}
	}

	game.CurrentTurn = opponent.UserID
	game.TurnNumber++
}

func (s *GameService) aiTurnLoop(game *Game) {
	for {
		time.Sleep(500 * time.Millisecond)

		game.mu.RLock()
		if game.Status != "playing" {
			game.mu.RUnlock()
			return
		}

		if game.CurrentTurn != game.Player2.UserID {
			game.mu.RUnlock()
			time.Sleep(1 * time.Second)
			continue
		}
		game.mu.RUnlock()

		time.Sleep(1 * time.Second)

		game.mu.Lock()
		if game.CurrentTurn != game.Player2.UserID || game.Status != "playing" {
			game.mu.Unlock()
			continue
		}

		aiPlayer := game.Player2
		cardsPlayed := 0

		for {
			cardToPlay := -1
			for i, card := range aiPlayer.Hand {
				if card.Cost <= aiPlayer.Mana {
					cardToPlay = i
					break
				}
			}

			if cardToPlay == -1 {
				break
			}

			card := aiPlayer.Hand[cardToPlay]
			aiPlayer.Hand = append(aiPlayer.Hand[:cardToPlay], aiPlayer.Hand[cardToPlay+1:]...)
			aiPlayer.Mana -= card.Cost
			aiPlayer.Field = append(aiPlayer.Field, card)

			s.applyCardEffect(game, aiPlayer, card)
			cardsPlayed++

			if cardsPlayed >= 2 {
				break
			}
		}

		s.cleanupDeadMinionsAll(game)
		s.checkGameEnd(game)

		if game.Status == "playing" {
			gameEvent := &proto.GameEvent{
				Type:    "ai_played",
				Message: "AI played cards",
				State:   s.deepCopyGameState(game),
			}
			s.broadcastEvent(game, gameEvent)

			time.Sleep(500 * time.Millisecond)

			s.endTurnEffects(game, game.Player2.UserID)
			s.cleanupDeadMinionsAll(game)
			s.checkGameEnd(game)

			endTurnEvent := &proto.GameEvent{
				Type:    "turn_ended",
				Message: game.Player1.Username + "'s turn",
				State:   s.deepCopyGameState(game),
			}
			s.broadcastEvent(game, endTurnEvent)
		}

		game.mu.Unlock()
	}
}

func (s *GameService) cleanupDeadMinionsAll(game *Game) {
	s.cleanupDeadMinions(game.Player1)
	s.cleanupDeadMinions(game.Player2)
}

func (s *GameService) cleanupDeadMinions(player *PlayerState) {
	alive := []models.Card{}
	for _, card := range player.Field {
		if card.Health > 0 {
			alive = append(alive, card)
		}
	}
	player.Field = alive
}

func (s *GameService) checkGameEnd(game *Game) {
	if game.Status != "playing" {
		return
	}

	if game.Player1.Health <= 0 {
		game.Status = "finished"
		game.WinnerID = game.Player2.UserID
		go s.saveMatchResult(game)
	} else if game.Player2.Health <= 0 {
		game.Status = "finished"
		game.WinnerID = game.Player1.UserID
		go s.saveMatchResult(game)
	}
}

func (s *GameService) saveMatchResult(game *Game) {
	tx, err := db.DB.Begin()
	if err != nil {
		log.Printf("Failed to begin transaction: %v", err)
		return
	}
	defer tx.Rollback()

	winnerRatingChange := 15
	loserRatingChange := -15

	var winnerID, loserID string
	if game.WinnerID == game.Player1.UserID {
		winnerID = game.Player1.UserID
		loserID = game.Player2.UserID
	} else {
		winnerID = game.Player2.UserID
		loserID = game.Player1.UserID
	}

	if !game.Player2.IsAI {
		_, err = tx.Exec(
			"INSERT INTO match_history (player1_id, player2_id, winner_id, player1_rating_change, player2_rating_change, is_ai) VALUES ($1, $2, $3, $4, $5, $6)",
			game.Player1.UserID, game.Player2.UserID, game.WinnerID,
			winnerRatingChange, loserRatingChange, false,
		)
		if err != nil {
			log.Printf("Failed to insert match history: %v", err)
			return
		}

		_, err = tx.Exec(
			"UPDATE users SET rating = rating + $1, wins = wins + 1 WHERE id = $2",
			winnerRatingChange, winnerID,
		)
		if err != nil {
			log.Printf("Failed to update winner: %v", err)
			return
		}

		_, err = tx.Exec(
			"UPDATE users SET rating = rating + $1, losses = losses + 1 WHERE id = $2",
			loserRatingChange, loserID,
		)
		if err != nil {
			log.Printf("Failed to update loser: %v", err)
			return
		}
	} else {
		_, err = tx.Exec(
			"INSERT INTO match_history (player1_id, player2_id, winner_id, player1_rating_change, player2_rating_change, is_ai) VALUES ($1, $2, $3, $4, $5, $6)",
			game.Player1.UserID, game.Player2.UserID, game.WinnerID,
			0, 0, true,
		)
		if err != nil {
			log.Printf("Failed to insert AI match history: %v", err)
			return
		}

		if winnerID == game.Player1.UserID {
			_, err = tx.Exec(
				"UPDATE users SET wins = wins + 1 WHERE id = $1",
				winnerID,
			)
		} else {
			_, err = tx.Exec(
				"UPDATE users SET losses = losses + 1 WHERE id = $1",
				game.Player1.UserID,
			)
		}
	}

	tx.Commit()
	log.Printf("Match %s completed, winner: %s", game.MatchID, game.WinnerID)
}

func (s *GameService) GetGameState(ctx context.Context, req *proto.GetGameStateRequest) (*proto.GetGameStateResponse, error) {
	s.mu.RLock()
	game, exists := s.games[req.MatchId]
	s.mu.RUnlock()

	if !exists {
		return nil, nil
	}

	game.mu.RLock()
	defer game.mu.RUnlock()

	return &proto.GetGameStateResponse{
		State: s.deepCopyGameState(game),
	}, nil
}

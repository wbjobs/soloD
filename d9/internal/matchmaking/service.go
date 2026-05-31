package matchmaking

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/cardgame/internal/db"
	"github.com/cardgame/proto"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

type MatchmakingService struct {
	proto.UnimplementedMatchmakingServiceServer
}

func NewMatchmakingService() *MatchmakingService {
	return &MatchmakingService{}
}

const (
	matchQueueKey   = "match_queue"
	matchStatusKey  = "match_status:"
	matchReadyKey   = "match_ready:"
)

type MatchRequest struct {
	UserID   string `json:"user_id"`
	Username string `json:"username"`
	Rating   int    `json:"rating"`
}

func (s *MatchmakingService) FindMatch(ctx context.Context, req *proto.FindMatchRequest) (*proto.FindMatchResponse, error) {
	log.Printf("FindMatch request from user: %s", req.UserId)

	var username string
	var rating int
	err := db.DB.QueryRow("SELECT username, rating FROM users WHERE id = $1", req.UserId).Scan(&username, &rating)
	if err != nil {
		log.Printf("Failed to get user info: %v", err)
		return &proto.FindMatchResponse{
			Success: false,
			Message: "User not found",
		}, nil
	}

	matchReq := MatchRequest{
		UserID:   req.UserId,
		Username: username,
		Rating:   rating,
	}

	matchReqJSON, _ := json.Marshal(matchReq)
	err = db.RedisClient.ZAdd(db.Ctx, matchQueueKey, redis.Z{
		Score:  float64(rating),
		Member: matchReqJSON,
	}).Err()

	if err != nil {
		log.Printf("Failed to add to match queue: %v", err)
		return &proto.FindMatchResponse{
			Success: false,
			Message: "Failed to join match queue",
		}, nil
	}

	statusKey := matchStatusKey + req.UserId
	db.RedisClient.Set(db.Ctx, statusKey, "searching", 5*time.Minute)

	go s.tryMatch()

	return &proto.FindMatchResponse{
		Success: true,
		Message: "Joined match queue",
		Status:  "searching",
	}, nil
}

func (s *MatchmakingService) FindAIMatch(ctx context.Context, req *proto.FindAIMatchRequest) (*proto.FindAIMatchResponse, error) {
	log.Printf("FindAIMatch request from user: %s, difficulty: %d", req.UserId, req.Difficulty)

	var username string
	err := db.DB.QueryRow("SELECT username FROM users WHERE id = $1", req.UserId).Scan(&username)
	if err != nil {
		log.Printf("Failed to get user info: %v", err)
		return &proto.FindAIMatchResponse{
			Success: false,
			Message: "User not found",
		}, nil
	}

	matchID := uuid.New().String()

	readyKey := matchReadyKey + req.UserId
	matchInfo := map[string]interface{}{
		"match_id":      matchID,
		"opponent_id":   "ai_" + uuid.New().String()[:8],
		"opponent_name": "AI Opponent",
		"status":        "matched",
		"is_ai":         "true",
	}

	db.RedisClient.HSet(db.Ctx, readyKey, matchInfo)
	db.RedisClient.Expire(db.Ctx, readyKey, 5*time.Minute)

	statusKey := matchStatusKey + req.UserId
	db.RedisClient.Set(db.Ctx, statusKey, "matched", 5*time.Minute)

	_, err = db.DB.Exec(`
		INSERT INTO user_active_games (user_id, match_id)
		VALUES ($1, $2)
		ON CONFLICT (user_id) DO UPDATE SET match_id = $2
	`, req.UserId, matchID)
	if err != nil {
		log.Printf("Failed to save active game: %v", err)
	}

	log.Printf("AI match created for user: %s, match_id: %s", req.UserId, matchID)

	return &proto.FindAIMatchResponse{
		Success: true,
		Message: "AI match created successfully",
		MatchId: matchID,
	}, nil
}

func (s *MatchmakingService) tryMatch() {
	for {
		queueLen, err := db.RedisClient.ZCard(db.Ctx, matchQueueKey).Result()
		if err != nil || queueLen < 2 {
			return
		}

		members, err := db.RedisClient.ZRange(db.Ctx, matchQueueKey, 0, 1).Result()
		if err != nil || len(members) < 2 {
			return
		}

		var player1, player2 MatchRequest
		json.Unmarshal([]byte(members[0]), &player1)
		json.Unmarshal([]byte(members[1]), &player2)

		matchID := uuid.New().String()

		readyKey1 := matchReadyKey + player1.UserID
		readyKey2 := matchReadyKey + player2.UserID

		matchInfo1 := map[string]interface{}{
			"match_id":      matchID,
			"opponent_id":   player2.UserID,
			"opponent_name": player2.Username,
			"status":        "matched",
			"is_ai":         "false",
		}
		matchInfo2 := map[string]interface{}{
			"match_id":      matchID,
			"opponent_id":   player1.UserID,
			"opponent_name": player1.Username,
			"status":        "matched",
			"is_ai":         "false",
		}

		db.RedisClient.HSet(db.Ctx, readyKey1, matchInfo1)
		db.RedisClient.HSet(db.Ctx, readyKey2, matchInfo2)
		db.RedisClient.Expire(db.Ctx, readyKey1, 5*time.Minute)
		db.RedisClient.Expire(db.Ctx, readyKey2, 5*time.Minute)

		db.RedisClient.ZRem(db.Ctx, matchQueueKey, members[0], members[1])

		statusKey1 := matchStatusKey + player1.UserID
		statusKey2 := matchStatusKey + player2.UserID
		db.RedisClient.Set(db.Ctx, statusKey1, "matched", 5*time.Minute)
		db.RedisClient.Set(db.Ctx, statusKey2, "matched", 5*time.Minute)

		_, err = db.DB.Exec(`
			INSERT INTO user_active_games (user_id, match_id)
			VALUES ($1, $2), ($3, $2)
			ON CONFLICT (user_id) DO UPDATE SET match_id = $2
		`, player1.UserID, matchID, player2.UserID)
		if err != nil {
			log.Printf("Failed to save active games: %v", err)
		}

		log.Printf("Match found: %s vs %s, match_id: %s", player1.Username, player2.Username, matchID)
	}
}

func (s *MatchmakingService) CancelMatch(ctx context.Context, req *proto.CancelMatchRequest) (*proto.CancelMatchResponse, error) {
	log.Printf("CancelMatch request from user: %s", req.UserId)

	members, err := db.RedisClient.ZRange(db.Ctx, matchQueueKey, 0, -1).Result()
	if err != nil {
		return &proto.CancelMatchResponse{
			Success: false,
			Message: "Failed to cancel match",
		}, nil
	}

	for _, member := range members {
		var matchReq MatchRequest
		json.Unmarshal([]byte(member), &matchReq)
		if matchReq.UserID == req.UserId {
			db.RedisClient.ZRem(db.Ctx, matchQueueKey, member)
			break
		}
	}

	statusKey := matchStatusKey + req.UserId
	db.RedisClient.Del(db.Ctx, statusKey)

	return &proto.CancelMatchResponse{
		Success: true,
		Message: "Match cancelled",
	}, nil
}

func (s *MatchmakingService) GetMatchStatus(ctx context.Context, req *proto.GetMatchStatusRequest) (*proto.GetMatchStatusResponse, error) {
	statusKey := matchStatusKey + req.UserId
	status, err := db.RedisClient.Get(db.Ctx, statusKey).Result()

	if err != nil || status == "searching" {
		return &proto.GetMatchStatusResponse{
			Status: "searching",
		}, nil
	}

	if status == "matched" {
		readyKey := matchReadyKey + req.UserId
		matchInfo, err := db.RedisClient.HGetAll(db.Ctx, readyKey).Result()
		if err != nil {
			return &proto.GetMatchStatusResponse{
				Status: "searching",
			}, nil
		}

		return &proto.GetMatchStatusResponse{
			Status:       "matched",
			MatchId:      matchInfo["match_id"],
			OpponentId:   matchInfo["opponent_id"],
			OpponentName: matchInfo["opponent_name"],
			IsAi:         matchInfo["is_ai"] == "true",
		}, nil
	}

	return &proto.GetMatchStatusResponse{
		Status: "idle",
	}, nil
}

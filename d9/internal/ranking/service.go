package ranking

import (
	"context"
	"log"

	"github.com/cardgame/internal/db"
	"github.com/cardgame/proto"
)

type RankingService struct {
	proto.UnimplementedRankingServiceServer
}

func NewRankingService() *RankingService {
	return &RankingService{}
}

func (s *RankingService) GetLeaderboard(ctx context.Context, req *proto.GetLeaderboardRequest) (*proto.GetLeaderboardResponse, error) {
	limit := req.Limit
	if limit <= 0 || limit > 100 {
		limit = 10
	}

	rows, err := db.DB.Query(
		`SELECT id, username, rating, wins, losses 
		 FROM users 
		 ORDER BY rating DESC 
		 LIMIT $1`,
		limit,
	)
	if err != nil {
		log.Printf("Failed to get leaderboard: %v", err)
		return nil, err
	}
	defer rows.Close()

	var rankings []*proto.UserRank
	rank := 1
	for rows.Next() {
		var userID, username string
		var rating, wins, losses int
		err := rows.Scan(&userID, &username, &rating, &wins, &losses)
		if err != nil {
			log.Printf("Failed to scan row: %v", err)
			continue
		}

		rankings = append(rankings, &proto.UserRank{
			Rank:     int32(rank),
			UserId:   userID,
			Username: username,
			Rating:   int32(rating),
			Wins:     int32(wins),
			Losses:   int32(losses),
		})
		rank++
	}

	return &proto.GetLeaderboardResponse{
		Rankings: rankings,
	}, nil
}

func (s *RankingService) GetMatchHistory(ctx context.Context, req *proto.GetMatchHistoryRequest) (*proto.GetMatchHistoryResponse, error) {
	limit := req.Limit
	if limit <= 0 || limit > 50 {
		limit = 20
	}

	rows, err := db.DB.Query(
		`SELECT 
			id, 
			player1_id, 
			player2_id, 
			winner_id, 
			player1_rating_change, 
			player2_rating_change,
			created_at
		 FROM match_history 
		 WHERE player1_id = $1 OR player2_id = $1
		 ORDER BY created_at DESC
		 LIMIT $2`,
		req.UserId, limit,
	)
	if err != nil {
		log.Printf("Failed to get match history: %v", err)
		return nil, err
	}
	defer rows.Close()

	var matches []*proto.MatchRecord
	for rows.Next() {
		var matchID, player1ID, player2ID, winnerID string
		var player1Change, player2Change int
		var createdAt int64
		err := rows.Scan(&matchID, &player1ID, &player2ID, &winnerID, &player1Change, &player2Change, &createdAt)
		if err != nil {
			log.Printf("Failed to scan match row: %v", err)
			continue
		}

		var opponentID string
		var opponentName string
		var won bool
		var ratingChange int

		if player1ID == req.UserId {
			opponentID = player2ID
			won = winnerID == player1ID
			ratingChange = player1Change
		} else {
			opponentID = player1ID
			won = winnerID == player2ID
			ratingChange = player2Change
		}

		db.DB.QueryRow("SELECT username FROM users WHERE id = $1", opponentID).Scan(&opponentName)

		matches = append(matches, &proto.MatchRecord{
			MatchId:      matchID,
			OpponentId:   opponentID,
			OpponentName: opponentName,
			Won:          won,
			Timestamp:    createdAt,
			RatingChange: int32(ratingChange),
		})
	}

	return &proto.GetMatchHistoryResponse{
		Matches: matches,
	}, nil
}

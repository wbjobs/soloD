package auth

import (
	"context"
	"database/sql"
	"errors"
	"log"

	"github.com/cardgame/internal/db"
	"github.com/cardgame/pkg/utils"
	"github.com/cardgame/proto"
	"golang.org/x/crypto/bcrypt"
)

type AuthService struct {
	proto.UnimplementedAuthServiceServer
}

func NewAuthService() *AuthService {
	return &AuthService{}
}

func (s *AuthService) Register(ctx context.Context, req *proto.RegisterRequest) (*proto.RegisterResponse, error) {
	log.Printf("Register attempt: %s", req.Username)

	hashedPassword, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return &proto.RegisterResponse{
			Success: false,
			Message: "Failed to hash password",
		}, nil
	}

	tx, err := db.DB.Begin()
	if err != nil {
		log.Printf("Transaction error: %v", err)
		return &proto.RegisterResponse{
			Success: false,
			Message: "Registration failed",
		}, nil
	}
	defer tx.Rollback()

	var userID string
	err = tx.QueryRow(
		"INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id",
		req.Username, string(hashedPassword),
	).Scan(&userID)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return &proto.RegisterResponse{
				Success: false,
				Message: "Username already exists",
			}, nil
		}
		log.Printf("Register error: %v", err)
		return &proto.RegisterResponse{
			Success: false,
			Message: "Registration failed",
		}, nil
	}

	starterCards := []string{"warrior", "warrior", "archer", "archer", "mage", "healer", "tank", "giant"}
	cardCounts := make(map[string]int)
	for _, cardID := range starterCards {
		cardCounts[cardID]++
	}

	for cardID, count := range cardCounts {
		_, err = tx.Exec(
			"INSERT INTO user_collection (user_id, card_id, count) VALUES ($1, $2, $3)",
			userID, cardID, count,
		)
		if err != nil {
			log.Printf("Failed to add starter cards: %v", err)
			return &proto.RegisterResponse{
				Success: false,
				Message: "Registration failed",
			}, nil
		}
	}

	var deckID string
	err = tx.QueryRow(
		"INSERT INTO decks (user_id, name, is_active) VALUES ($1, $2, $3) RETURNING id",
		userID, "Starter Deck", true,
	).Scan(&deckID)

	if err != nil {
		log.Printf("Failed to create starter deck: %v", err)
		return &proto.RegisterResponse{
			Success: false,
			Message: "Registration failed",
		}, nil
	}

	for cardID, count := range cardCounts {
		_, err = tx.Exec(
			"INSERT INTO deck_cards (deck_id, card_id, count) VALUES ($1, $2, $3)",
			deckID, cardID, count,
		)
		if err != nil {
			log.Printf("Failed to add cards to deck: %v", err)
			return &proto.RegisterResponse{
				Success: false,
				Message: "Registration failed",
			}, nil
		}
	}

	if err = tx.Commit(); err != nil {
		log.Printf("Commit error: %v", err)
		return &proto.RegisterResponse{
			Success: false,
			Message: "Registration failed",
		}, nil
	}

	log.Printf("User registered: %s", userID)
	return &proto.RegisterResponse{
		Success: true,
		Message: "Registration successful",
		UserId:  userID,
	}, nil
}

func (s *AuthService) Login(ctx context.Context, req *proto.LoginRequest) (*proto.LoginResponse, error) {
	log.Printf("Login attempt: %s", req.Username)

	var userID, username, passwordHash string
	var level, rating, wins, losses int32

	err := db.DB.QueryRow(
		"SELECT id, username, password_hash, level, rating, wins, losses FROM users WHERE username = $1",
		req.Username,
	).Scan(&userID, &username, &passwordHash, &level, &rating, &wins, &losses)

	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return &proto.LoginResponse{
				Success: false,
				Message: "Invalid credentials",
			}, nil
		}
		log.Printf("Login error: %v", err)
		return &proto.LoginResponse{
			Success: false,
			Message: "Login failed",
		}, nil
	}

	err = bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password))
	if err != nil {
		return &proto.LoginResponse{
			Success: false,
			Message: "Invalid credentials",
		}, nil
	}

	token, err := utils.GenerateToken(userID, username)
	if err != nil {
		log.Printf("Token generation error: %v", err)
		return &proto.LoginResponse{
			Success: false,
			Message: "Failed to generate token",
		}, nil
	}

	log.Printf("User logged in: %s", userID)
	return &proto.LoginResponse{
		Success: true,
		Message: "Login successful",
		Token:   token,
		User: &proto.User{
			Id:       userID,
			Username: username,
			Level:    level,
			Rating:   rating,
			Wins:     wins,
			Losses:   losses,
		},
	}, nil
}

func (s *AuthService) GetUserInfo(ctx context.Context, req *proto.GetUserInfoRequest) (*proto.GetUserInfoResponse, error) {
	var username string
	var level, rating, wins, losses int32

	err := db.DB.QueryRow(
		"SELECT username, level, rating, wins, losses FROM users WHERE id = $1",
		req.UserId,
	).Scan(&username, &level, &rating, &wins, &losses)

	if err != nil {
		log.Printf("GetUserInfo error: %v", err)
		return nil, err
	}

	return &proto.GetUserInfoResponse{
		User: &proto.User{
			Id:       req.UserId,
			Username: username,
			Level:    level,
			Rating:   rating,
			Wins:     wins,
			Losses:   losses,
		},
	}, nil
}

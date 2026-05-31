package main

import (
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"

	"github.com/cardgame/internal/auth"
	"github.com/cardgame/internal/collection"
	"github.com/cardgame/internal/config"
	"github.com/cardgame/internal/db"
	"github.com/cardgame/internal/game"
	"github.com/cardgame/internal/matchmaking"
	"github.com/cardgame/internal/ranking"
	"github.com/cardgame/proto"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

func main() {
	cfg := config.Load()

	if err := db.InitPostgreSQL(&cfg.PostgreSQL); err != nil {
		log.Fatalf("Failed to connect to PostgreSQL: %v", err)
	}
	log.Println("PostgreSQL connected successfully")

	if err := db.InitRedis(&cfg.Redis); err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}
	log.Println("Redis connected successfully")

	lis, err := net.Listen("tcp", cfg.Server.Port)
	if err != nil {
		log.Fatalf("Failed to listen: %v", err)
	}

	s := grpc.NewServer()

	proto.RegisterAuthServiceServer(s, auth.NewAuthService())
	proto.RegisterMatchmakingServiceServer(s, matchmaking.NewMatchmakingService())
	proto.RegisterGameServiceServer(s, game.NewGameService())
	proto.RegisterRankingServiceServer(s, ranking.NewRankingService())
	proto.RegisterCollectionServiceServer(s, collection.NewCollectionService())

	reflection.Register(s)

	go func() {
		log.Printf("Server starting on %s...", cfg.Server.Port)
		if err := s.Serve(lis); err != nil {
			log.Fatalf("Failed to serve: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down server...")
	s.GracefulStop()
	log.Println("Server stopped")
}

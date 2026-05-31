package collection

import (
	"context"
	"database/sql"
	"log"

	"github.com/cardgame/internal/db"
	"github.com/cardgame/proto"
	"github.com/google/uuid"
)

type CollectionService struct {
	proto.UnimplementedCollectionServiceServer
}

func NewCollectionService() *CollectionService {
	return &CollectionService{}
}

func (s *CollectionService) GetCardTemplates(ctx context.Context, req *proto.GetCardTemplatesRequest) (*proto.GetCardTemplatesResponse, error) {
	rows, err := db.DB.Query(`
		SELECT id, name, cost, attack, health, effect, description, rarity
		FROM card_templates
		ORDER BY cost, name
	`)
	if err != nil {
		log.Printf("Failed to get card templates: %v", err)
		return nil, err
	}
	defer rows.Close()

	var cards []*proto.CardTemplate
	for rows.Next() {
		card := &proto.CardTemplate{}
		err := rows.Scan(&card.CardId, &card.Name, &card.Cost, &card.Attack,
			&card.Health, &card.Effect, &card.Description, &card.Rarity)
		if err != nil {
			log.Printf("Failed to scan card template: %v", err)
			continue
		}
		cards = append(cards, card)
	}

	return &proto.GetCardTemplatesResponse{Cards: cards}, nil
}

func (s *CollectionService) GetCollection(ctx context.Context, req *proto.GetCollectionRequest) (*proto.GetCollectionResponse, error) {
	rows, err := db.DB.Query(`
		SELECT card_id, count
		FROM user_collection
		WHERE user_id = $1
	`, req.UserId)
	if err != nil {
		log.Printf("Failed to get collection: %v", err)
		return nil, err
	}
	defer rows.Close()

	counts := make(map[string]int32)
	var cardIDs []string

	for rows.Next() {
		var cardID string
		var count int32
		if err := rows.Scan(&cardID, &count); err != nil {
			log.Printf("Failed to scan collection: %v", err)
			continue
		}
		cardIDs = append(cardIDs, cardID)
		counts[cardID] = count
	}

	return &proto.GetCollectionResponse{
		CardIds: cardIDs,
		Counts:  counts,
	}, nil
}

func (s *CollectionService) GetDecks(ctx context.Context, req *proto.GetDecksRequest) (*proto.GetDecksResponse, error) {
	rows, err := db.DB.Query(`
		SELECT id, name, is_active
		FROM decks
		WHERE user_id = $1
		ORDER BY created_at DESC
	`, req.UserId)
	if err != nil {
		log.Printf("Failed to get decks: %v", err)
		return nil, err
	}
	defer rows.Close()

	var decks []*proto.Deck
	for rows.Next() {
		deck := &proto.Deck{}
		if err := rows.Scan(&deck.Id, &deck.Name, &deck.IsActive); err != nil {
			log.Printf("Failed to scan deck: %v", err)
			continue
		}

		cardRows, err := db.DB.Query(`
			SELECT card_id, count
			FROM deck_cards
			WHERE deck_id = $1
		`, deck.Id)
		if err != nil {
			log.Printf("Failed to get deck cards: %v", err)
			continue
		}

		var cardIDs []string
		for cardRows.Next() {
			var cardID string
			var count int
			if err := cardRows.Scan(&cardID, &count); err != nil {
				continue
			}
			for i := 0; i < count; i++ {
				cardIDs = append(cardIDs, cardID)
			}
		}
		cardRows.Close()

		deck.CardIds = cardIDs
		decks = append(decks, deck)
	}

	return &proto.GetDecksResponse{Decks: decks}, nil
}

func (s *CollectionService) CreateDeck(ctx context.Context, req *proto.CreateDeckRequest) (*proto.CreateDeckResponse, error) {
	tx, err := db.DB.Begin()
	if err != nil {
		return &proto.CreateDeckResponse{
			Success: false,
			Message: "Failed to create deck",
		}, nil
	}
	defer tx.Rollback()

	deckID := uuid.New().String()
	_, err = tx.Exec(
		"INSERT INTO decks (id, user_id, name, is_active) VALUES ($1, $2, $3, $4)",
		deckID, req.UserId, req.Name, false,
	)
	if err != nil {
		log.Printf("Failed to insert deck: %v", err)
		return &proto.CreateDeckResponse{
			Success: false,
			Message: "Failed to create deck",
		}, nil
	}

	cardCounts := make(map[string]int)
	for _, cardID := range req.CardIds {
		cardCounts[cardID]++
	}

	for cardID, count := range cardCounts {
		var hasCard bool
		err = tx.QueryRow(`
			SELECT EXISTS(
				SELECT 1 FROM user_collection
				WHERE user_id = $1 AND card_id = $2 AND count >= $3
			)
		`, req.UserId, cardID, count).Scan(&hasCard)
		if err != nil || !hasCard {
			return &proto.CreateDeckResponse{
				Success: false,
				Message: "Insufficient cards in collection: " + cardID,
			}, nil
		}

		_, err = tx.Exec(
			"INSERT INTO deck_cards (deck_id, card_id, count) VALUES ($1, $2, $3)",
			deckID, cardID, count,
		)
		if err != nil {
			log.Printf("Failed to insert deck card: %v", err)
			return &proto.CreateDeckResponse{
				Success: false,
				Message: "Failed to add cards to deck",
			}, nil
		}
	}

	if err = tx.Commit(); err != nil {
		log.Printf("Commit error: %v", err)
		return &proto.CreateDeckResponse{
			Success: false,
			Message: "Failed to create deck",
		}, nil
	}

	return &proto.CreateDeckResponse{
		Success: true,
		Message: "Deck created successfully",
		Deck: &proto.Deck{
			Id:       deckID,
			Name:     req.Name,
			CardIds:  req.CardIds,
			IsActive: false,
		},
	}, nil
}

func (s *CollectionService) UpdateDeck(ctx context.Context, req *proto.UpdateDeckRequest) (*proto.UpdateDeckResponse, error) {
	tx, err := db.DB.Begin()
	if err != nil {
		return &proto.UpdateDeckResponse{
			Success: false,
			Message: "Failed to update deck",
		}, nil
	}
	defer tx.Rollback()

	var ownerID string
	err = tx.QueryRow("SELECT user_id FROM decks WHERE id = $1", req.DeckId).Scan(&ownerID)
	if err != nil {
		return &proto.UpdateDeckResponse{
			Success: false,
			Message: "Deck not found",
		}, nil
	}
	if ownerID != req.UserId {
		return &proto.UpdateDeckResponse{
			Success: false,
			Message: "Not authorized to update this deck",
		}, nil
	}

	if req.Name != "" {
		_, err = tx.Exec("UPDATE decks SET name = $1 WHERE id = $2", req.Name, req.DeckId)
		if err != nil {
			log.Printf("Failed to update deck name: %v", err)
			return &proto.UpdateDeckResponse{
				Success: false,
				Message: "Failed to update deck",
			}, nil
		}
	}

	if req.CardIds != nil {
		_, err = tx.Exec("DELETE FROM deck_cards WHERE deck_id = $1", req.DeckId)
		if err != nil {
			log.Printf("Failed to delete old deck cards: %v", err)
			return &proto.UpdateDeckResponse{
				Success: false,
				Message: "Failed to update deck",
			}, nil
		}

		cardCounts := make(map[string]int)
		for _, cardID := range req.CardIds {
			cardCounts[cardID]++
		}

		for cardID, count := range cardCounts {
			var hasCard bool
			err = tx.QueryRow(`
				SELECT EXISTS(
					SELECT 1 FROM user_collection
					WHERE user_id = $1 AND card_id = $2 AND count >= $3
				)
			`, req.UserId, cardID, count).Scan(&hasCard)
			if err != nil || !hasCard {
				return &proto.UpdateDeckResponse{
					Success: false,
					Message: "Insufficient cards in collection: " + cardID,
				}, nil
			}

			_, err = tx.Exec(
				"INSERT INTO deck_cards (deck_id, card_id, count) VALUES ($1, $2, $3)",
				req.DeckId, cardID, count,
			)
			if err != nil {
				log.Printf("Failed to insert deck card: %v", err)
				return &proto.UpdateDeckResponse{
					Success: false,
					Message: "Failed to update deck cards",
				}, nil
			}
		}
	}

	if err = tx.Commit(); err != nil {
		log.Printf("Commit error: %v", err)
		return &proto.UpdateDeckResponse{
			Success: false,
			Message: "Failed to update deck",
		}, nil
	}

	return &proto.UpdateDeckResponse{
		Success: true,
		Message: "Deck updated successfully",
	}, nil
}

func (s *CollectionService) DeleteDeck(ctx context.Context, req *proto.DeleteDeckRequest) (*proto.DeleteDeckResponse, error) {
	var ownerID string
	err := db.DB.QueryRow("SELECT user_id FROM decks WHERE id = $1", req.DeckId).Scan(&ownerID)
	if err != nil {
		return &proto.DeleteDeckResponse{
			Success: false,
			Message: "Deck not found",
		}, nil
	}
	if ownerID != req.UserId {
		return &proto.DeleteDeckResponse{
			Success: false,
			Message: "Not authorized to delete this deck",
		}, nil
	}

	var isActive bool
	db.DB.QueryRow("SELECT is_active FROM decks WHERE id = $1", req.DeckId).Scan(&isActive)
	if isActive {
		return &proto.DeleteDeckResponse{
			Success: false,
			Message: "Cannot delete active deck",
		}, nil
	}

	_, err = db.DB.Exec("DELETE FROM decks WHERE id = $1", req.DeckId)
	if err != nil {
		log.Printf("Failed to delete deck: %v", err)
		return &proto.DeleteDeckResponse{
			Success: false,
			Message: "Failed to delete deck",
		}, nil
	}

	return &proto.DeleteDeckResponse{
		Success: true,
		Message: "Deck deleted successfully",
	}, nil
}

func (s *CollectionService) SetActiveDeck(ctx context.Context, req *proto.SetActiveDeckRequest) (*proto.SetActiveDeckResponse, error) {
	tx, err := db.DB.Begin()
	if err != nil {
		return &proto.SetActiveDeckResponse{
			Success: false,
			Message: "Failed to set active deck",
		}, nil
	}
	defer tx.Rollback()

	var ownerID string
	err = tx.QueryRow("SELECT user_id FROM decks WHERE id = $1", req.DeckId).Scan(&ownerID)
	if err != nil {
		return &proto.SetActiveDeckResponse{
			Success: false,
			Message: "Deck not found",
		}, nil
	}
	if ownerID != req.UserId {
		return &proto.SetActiveDeckResponse{
			Success: false,
			Message: "Not authorized",
		}, nil
	}

	_, err = tx.Exec("UPDATE decks SET is_active = false WHERE user_id = $1", req.UserId)
	if err != nil {
		log.Printf("Failed to deactivate other decks: %v", err)
		return &proto.SetActiveDeckResponse{
			Success: false,
			Message: "Failed to set active deck",
		}, nil
	}

	_, err = tx.Exec("UPDATE decks SET is_active = true WHERE id = $1", req.DeckId)
	if err != nil {
		log.Printf("Failed to activate deck: %v", err)
		return &proto.SetActiveDeckResponse{
			Success: false,
			Message: "Failed to set active deck",
		}, nil
	}

	if err = tx.Commit(); err != nil {
		log.Printf("Commit error: %v", err)
		return &proto.SetActiveDeckResponse{
			Success: false,
			Message: "Failed to set active deck",
		}, nil
	}

	return &proto.SetActiveDeckResponse{
		Success: true,
		Message: "Active deck set successfully",
	}, nil
}

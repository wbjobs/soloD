package db

import (
	"database/sql"
	"fmt"
	"log"

	"github.com/cardgame/internal/config"
	_ "github.com/lib/pq"
)

var DB *sql.DB

func InitPostgreSQL(cfg *config.PostgreSQLConfig) error {
	connStr := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
		cfg.Host, cfg.Port, cfg.User, cfg.Password, cfg.DBName, cfg.SSLMode,
	)

	var err error
	DB, err = sql.Open("postgres", connStr)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	if err = DB.Ping(); err != nil {
		return fmt.Errorf("failed to ping database: %w", err)
	}

	if err = createTables(); err != nil {
		return fmt.Errorf("failed to create tables: %w", err)
	}

	log.Println("PostgreSQL connected successfully")
	return nil
}

func createTables() error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			username VARCHAR(50) UNIQUE NOT NULL,
			password_hash VARCHAR(255) NOT NULL,
			level INT DEFAULT 1,
			rating INT DEFAULT 1000,
			wins INT DEFAULT 0,
			losses INT DEFAULT 0,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS match_history (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			player1_id UUID REFERENCES users(id),
			player2_id UUID REFERENCES users(id),
			winner_id UUID REFERENCES users(id),
			player1_rating_change INT DEFAULT 0,
			player2_rating_change INT DEFAULT 0,
			is_ai BOOLEAN DEFAULT FALSE,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS card_templates (
			id VARCHAR(50) PRIMARY KEY,
			name VARCHAR(100) NOT NULL,
			cost INT NOT NULL,
			attack INT NOT NULL,
			health INT NOT NULL,
			effect VARCHAR(50) DEFAULT 'none',
			description TEXT,
			rarity VARCHAR(20) DEFAULT 'common'
		)`,
		`CREATE TABLE IF NOT EXISTS user_collection (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id UUID REFERENCES users(id) ON DELETE CASCADE,
			card_id VARCHAR(50) REFERENCES card_templates(id) ON DELETE CASCADE,
			count INT DEFAULT 1,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(user_id, card_id)
		)`,
		`CREATE TABLE IF NOT EXISTS decks (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id UUID REFERENCES users(id) ON DELETE CASCADE,
			name VARCHAR(100) NOT NULL,
			is_active BOOLEAN DEFAULT FALSE,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS deck_cards (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			deck_id UUID REFERENCES decks(id) ON DELETE CASCADE,
			card_id VARCHAR(50) REFERENCES card_templates(id) ON DELETE CASCADE,
			count INT DEFAULT 1,
			UNIQUE(deck_id, card_id)
		)`,
		`CREATE TABLE IF NOT EXISTS user_active_games (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id UUID REFERENCES users(id) ON DELETE CASCADE UNIQUE,
			match_id VARCHAR(100) NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_match_history_player1 ON match_history(player1_id)`,
		`CREATE INDEX IF NOT EXISTS idx_match_history_player2 ON match_history(player2_id)`,
		`CREATE INDEX IF NOT EXISTS idx_users_rating ON users(rating DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_user_collection_user ON user_collection(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_decks_user ON decks(user_id)`,
	}

	for _, query := range queries {
		_, err := DB.Exec(query)
		if err != nil {
			return err
		}
	}

	initializeCardTemplates()
	return nil
}

func initializeCardTemplates() error {
	templates := []struct {
		ID          string
		Name        string
		Cost        int
		Attack      int
		Health      int
		Effect      string
		Description string
		Rarity      string
	}{
		{"warrior", "Warrior", 2, 3, 2, "none", "Basic warrior unit", "common"},
		{"archer", "Archer", 2, 2, 3, "none", "Basic archer unit", "common"},
		{"mage", "Mage", 3, 4, 2, "spell_damage", "Deals 2 damage on summon", "rare"},
		{"healer", "Healer", 3, 1, 4, "heal", "Heals 2 health on summon", "rare"},
		{"tank", "Tank", 4, 2, 6, "taunt", "Taunt - must be attacked first", "rare"},
		{"assassin", "Assassin", 3, 5, 1, "stealth", "Stealth for 1 turn", "epic"},
		{"giant", "Giant", 5, 5, 5, "none", "Powerful giant unit", "epic"},
		{"dragon", "Dragon", 7, 7, 7, "burn", "Burns enemies for 1 damage per turn", "legendary"},
	}

	for _, t := range templates {
		_, err := DB.Exec(`
			INSERT INTO card_templates (id, name, cost, attack, health, effect, description, rarity)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			ON CONFLICT (id) DO NOTHING`,
			t.ID, t.Name, t.Cost, t.Attack, t.Health, t.Effect, t.Description, t.Rarity)
		if err != nil {
			return err
		}
	}

	return nil
}

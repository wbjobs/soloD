package models

import (
	"math/rand"
	"time"
)

type Card struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Cost        int    `json:"cost"`
	Attack      int    `json:"attack"`
	Health      int    `json:"health"`
	Effect      string `json:"effect"`
	Description string `json:"description"`
}

var cardTemplates = []Card{
	{ID: "warrior", Name: "Warrior", Cost: 2, Attack: 3, Health: 2, Effect: "none", Description: "Basic warrior unit"},
	{ID: "archer", Name: "Archer", Cost: 2, Attack: 2, Health: 3, Effect: "none", Description: "Basic archer unit"},
	{ID: "mage", Name: "Mage", Cost: 3, Attack: 4, Health: 2, Effect: "spell_damage", Description: "Deals 2 damage on summon"},
	{ID: "healer", Name: "Healer", Cost: 3, Attack: 1, Health: 4, Effect: "heal", Description: "Heals 2 health on summon"},
	{ID: "tank", Name: "Tank", Cost: 4, Attack: 2, Health: 6, Effect: "taunt", Description: "Taunt - must be attacked first"},
	{ID: "assassin", Name: "Assassin", Cost: 3, Attack: 5, Health: 1, Effect: "stealth", Description: "Stealth for 1 turn"},
	{ID: "giant", Name: "Giant", Cost: 5, Attack: 5, Health: 5, Effect: "none", Description: "Powerful giant unit"},
	{ID: "dragon", Name: "Dragon", Cost: 7, Attack: 7, Health: 7, Effect: "burn", Description: "Burns enemies for 1 damage per turn"},
}

func GenerateDeck() []Card {
	rand.Seed(time.Now().UnixNano())
	deck := make([]Card, 0, 20)

	for i := 0; i < 20; i++ {
		template := cardTemplates[rand.Intn(len(cardTemplates))]
		card := Card{
			ID:          template.ID + "_" + randString(5),
			Name:        template.Name,
			Cost:        template.Cost,
			Attack:      template.Attack,
			Health:      template.Health,
			Effect:      template.Effect,
			Description: template.Description,
		}
		deck = append(deck, card)
	}

	ShuffleDeck(deck)
	return deck
}

func ShuffleDeck(deck []Card) {
	rand.Seed(time.Now().UnixNano())
	rand.Shuffle(len(deck), func(i, j int) {
		deck[i], deck[j] = deck[j], deck[i]
	})
}

func randString(n int) string {
	const letters = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = letters[rand.Intn(len(letters))]
	}
	return string(b)
}

package main

import (
	"fmt"

	"github.com/golang-jwt/jwt/v5"
)

const jwtSecret = "your-secret-key-change-in-production"

func verifyToken(tokenString string) (string, string, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(jwtSecret), nil
	})

	if err != nil {
		return "", "", err
	}

	if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
		roomID := claims["roomId"].(string)
		username := claims["username"].(string)
		return roomID, username, nil
	}

	return "", "", fmt.Errorf("invalid token")
}

package models

import "time"

type User struct {
	ID           uint64    `json:"id"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	DisplayName  string    `json:"display_name"`
	AvatarURL    *string   `json:"avatar_url,omitempty"`
	// Lazy-populated Personal Meeting Room. nil until first GET /users/me/pmr.
	PMRRoomID *uint64   `json:"pmr_room_id,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

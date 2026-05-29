package models

import "time"

type Room struct {
	ID        uint64    `json:"id"`
	Slug      string    `json:"slug"`
	Name      string    `json:"name"`
	OwnerID   uint64    `json:"owner_id"`
	IsPublic  bool      `json:"is_public"`
	IsLocked  bool      `json:"is_locked"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

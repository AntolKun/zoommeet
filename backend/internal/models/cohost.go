package models

import "time"

// Cohost is a non-owner user that the owner has granted host privileges to.
// Owner is implicit (always has all rights) and is never represented here.
type Cohost struct {
	RoomID    uint64    `json:"room_id"`
	UserID    uint64    `json:"user_id"`
	GrantedBy *uint64   `json:"granted_by,omitempty"`
	GrantedAt time.Time `json:"granted_at"`
	// Filled when joined with users table.
	DisplayName string `json:"display_name,omitempty"`
	Email       string `json:"email,omitempty"`
}

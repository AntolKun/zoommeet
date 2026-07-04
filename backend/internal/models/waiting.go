package models

import "time"

const (
	WaitingStatusPending  = "pending"
	WaitingStatusApproved = "approved"
	WaitingStatusDenied   = "denied"
)

type WaitingRequest struct {
	ID           uint64     `json:"id"`
	RoomID       uint64     `json:"room_id"`
	UserID       *uint64    `json:"user_id,omitempty"`
	DisplayName  string     `json:"display_name"`
	Status       string     `json:"status"`
	RequestToken string     `json:"-"` // never expose to other clients
	LiveKitToken string     `json:"-"` // never expose in admin list response
	CreatedAt    time.Time  `json:"created_at"`
	DecidedAt    *time.Time `json:"decided_at,omitempty"`
}

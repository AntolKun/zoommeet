package models

import "time"

type Message struct {
	ID        uint64    `json:"id"`
	RoomID    uint64    `json:"room_id"`
	SenderID  uint64    `json:"sender_id"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"created_at"`

	SenderName string `json:"sender_name,omitempty"`
}

package models

import "time"

type Message struct {
	ID        uint64     `json:"id"`
	RoomID    uint64     `json:"room_id"`
	SenderID  uint64     `json:"sender_id"`
	// nil = public message visible to everyone in the room.
	// set = DM only visible to sender + this recipient.
	RecipientID *uint64    `json:"recipient_id,omitempty"`
	Body        string     `json:"body"`
	EditedAt    *time.Time `json:"edited_at,omitempty"`
	DeletedAt   *time.Time `json:"deleted_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`

	SenderName    string `json:"sender_name,omitempty"`
	RecipientName string `json:"recipient_name,omitempty"`
	// Reaction aggregation populated lazily by the list endpoint.
	// Key = emoji, value = list of user IDs that reacted.
	Reactions map[string][]uint64 `json:"reactions,omitempty"`
}

type MessageReaction struct {
	ID        uint64    `json:"id"`
	MessageID uint64    `json:"message_id"`
	UserID    uint64    `json:"user_id"`
	Emoji     string    `json:"emoji"`
	CreatedAt time.Time `json:"created_at"`
}

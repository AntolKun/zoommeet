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
	// Optional file attachment — nil for text-only messages.
	AttachmentURL  *string `json:"attachment_url,omitempty"`
	AttachmentName *string `json:"attachment_name,omitempty"`
	AttachmentType *string `json:"attachment_type,omitempty"`
	AttachmentSize *uint64 `json:"attachment_size,omitempty"`
	// Reply-to reference. When set, the client should render a quote block
	// above the body. reply_to_* fields are populated by the list query so
	// the frontend doesn't need a second round-trip to fetch the parent.
	ReplyToMessageID *uint64 `json:"reply_to_message_id,omitempty"`
	ReplyToBody      *string `json:"reply_to_body,omitempty"`
	ReplyToSender    *string `json:"reply_to_sender,omitempty"`
	// Host-pinned. Cooperative — the backend enforces host-only on the pin
	// endpoint but the flag itself is a plain column, no special access rules.
	IsPinned bool       `json:"is_pinned"`
	EditedAt *time.Time `json:"edited_at,omitempty"`
	DeletedAt      *time.Time `json:"deleted_at,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`

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

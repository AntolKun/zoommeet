package models

import "time"

type Poll struct {
	ID        uint64       `json:"id"`
	RoomID    uint64       `json:"room_id"`
	Question  string       `json:"question"`
	CreatedBy uint64       `json:"created_by"`
	CreatedAt time.Time    `json:"created_at"`
	ClosedAt  *time.Time   `json:"closed_at,omitempty"`
	Options   []PollOption `json:"options"`
	// Per-poll vote totals keyed by option_id. Empty/nil when not joined in
	// the query (caller can fetch lazily).
	Counts map[uint64]uint64 `json:"counts,omitempty"`
	// The current user's vote option_id if they've voted, nil otherwise.
	MyVote *uint64 `json:"my_vote,omitempty"`
	// Convenience flag derived from ClosedAt.
	IsOpen bool `json:"is_open"`
}

type PollOption struct {
	ID       uint64 `json:"id"`
	PollID   uint64 `json:"poll_id"`
	Position uint32 `json:"position"`
	Label    string `json:"label"`
}

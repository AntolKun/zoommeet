package models

import "time"

type BreakoutRoom struct {
	ID           uint64     `json:"id"`
	ParentRoomID uint64     `json:"parent_room_id"`
	Slug         string     `json:"slug"`
	Name         string     `json:"name"`
	CreatedBy    uint64     `json:"created_by"`
	CreatedAt    time.Time  `json:"created_at"`
	ClosedAt     *time.Time `json:"closed_at,omitempty"`
}

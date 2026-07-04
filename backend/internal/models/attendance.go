package models

import "time"

type AttendanceEntry struct {
	ID              uint64     `json:"id"`
	RoomID          uint64     `json:"room_id"`
	UserID          *uint64    `json:"user_id,omitempty"`
	DisplayName     string     `json:"display_name"`
	Identity        string     `json:"identity"`
	JoinedAt        time.Time  `json:"joined_at"`
	LeftAt          *time.Time `json:"left_at,omitempty"`
	DurationSeconds *uint32    `json:"duration_seconds,omitempty"`
}

package models

import "time"

const (
	RecordingStatusStarting = "starting"
	RecordingStatusActive   = "active"
	RecordingStatusEnding   = "ending"
	RecordingStatusComplete = "complete"
	RecordingStatusFailed   = "failed"
)

type Recording struct {
	ID              uint64     `json:"id"`
	RoomID          uint64     `json:"room_id"`
	EgressID        string     `json:"egress_id"`
	Status          string     `json:"status"`
	StartedBy       uint64     `json:"started_by"`
	FilePath        *string    `json:"file_path,omitempty"`
	FileURL         *string    `json:"file_url,omitempty"`
	FileSize        *uint64    `json:"file_size,omitempty"`
	DurationSeconds *uint32    `json:"duration_seconds,omitempty"`
	StartedAt       time.Time  `json:"started_at"`
	EndedAt         *time.Time `json:"ended_at,omitempty"`
	Error           *string    `json:"error,omitempty"`
}

package models

import "time"

type Room struct {
	ID              uint64     `json:"id"`
	Slug            string     `json:"slug"`
	Name            string     `json:"name"`
	OwnerID         uint64     `json:"owner_id"`
	IsPublic        bool       `json:"is_public"`
	IsLocked        bool       `json:"is_locked"`
	HasPassword     bool       `json:"has_password"`
	ScheduledAt     *time.Time `json:"scheduled_at,omitempty"`
	DurationMinutes *uint32    `json:"duration_minutes,omitempty"`
	// "daily" or "weekly"; nil = one-time meeting.
	Recurrence         *string   `json:"recurrence,omitempty"`
	WaitingRoomEnabled bool      `json:"waiting_room_enabled"`
	// When true, peserta yang baru join landed di pre-join dengan mic/cam off.
	// Owner-configurable, peserta tetep bisa override sebelum klik Join.
	DefaultMicOff bool      `json:"default_mic_off"`
	DefaultCamOff bool      `json:"default_cam_off"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`

	// Never sent over the wire — populated when the row is loaded so handlers
	// can compare against incoming password input.
	PasswordHash string `json:"-"`
}

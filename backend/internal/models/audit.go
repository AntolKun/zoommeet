package models

import "time"

const (
	AuditActorRoleOwner  = "owner"
	AuditActorRoleCohost = "cohost"
)

// Common action constants. Strings stay on the audit_logs.action column so
// new actions don't need a migration.
const (
	AuditActionRoomLocked         = "room_locked"
	AuditActionRoomUnlocked       = "room_unlocked"
	AuditActionParticipantMuted   = "participant_muted"
	AuditActionParticipantKicked  = "participant_kicked"
	AuditActionRecordingStarted   = "recording_started"
	AuditActionRecordingStopped   = "recording_stopped"
	AuditActionCohostAdded        = "cohost_added"
	AuditActionCohostRemoved      = "cohost_removed"
	AuditActionWaitingAdmitted    = "waiting_admitted"
	AuditActionWaitingDenied      = "waiting_denied"
	AuditActionWaitingRoomToggled = "waiting_room_toggled"
)

type AuditEntry struct {
	ID        uint64    `json:"id"`
	RoomID    uint64    `json:"room_id"`
	ActorID   uint64    `json:"actor_id"`
	ActorRole string    `json:"actor_role"`
	Action    string    `json:"action"`
	Target    *string   `json:"target,omitempty"`
	Detail    *string   `json:"detail,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	// Filled when joined with users table.
	ActorName string `json:"actor_name,omitempty"`
}

-- Attendance log: one row per (participant, join). `left_at` populated when
-- the client cleanly leaves; rows without left_at represent either a still-
-- in-progress session or a participant whose disconnect was missed (browser
-- closed mid-session).
CREATE TABLE IF NOT EXISTS attendance_logs (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    room_id BIGINT UNSIGNED NOT NULL,
    -- NULL = guest. Otherwise an authenticated user.
    user_id BIGINT UNSIGNED NULL,
    display_name VARCHAR(100) NOT NULL,
    -- LiveKit participant identity (numeric for auth, "guest_xxxx" for guests).
    identity VARCHAR(80) NOT NULL,
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP NULL,
    duration_seconds INT UNSIGNED NULL,
    INDEX idx_attendance_room_joined (room_id, joined_at),
    INDEX idx_attendance_user (user_id),
    CONSTRAINT fk_attendance_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    CONSTRAINT fk_attendance_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Audit log: each host/cohost moderation action recorded for accountability.
-- Stores the actor (who did it), action type, target (optional — participant
-- identity, recording id, etc.), and arbitrary detail metadata as JSON-ish text.
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    room_id BIGINT UNSIGNED NOT NULL,
    actor_id BIGINT UNSIGNED NOT NULL,
    actor_role VARCHAR(20) NOT NULL, -- 'owner' | 'cohost'
    -- Examples: room_locked, room_unlocked, participant_muted, participant_kicked,
    -- recording_started, recording_stopped, cohost_added, cohost_removed,
    -- waiting_admitted, waiting_denied, waiting_room_toggled.
    action VARCHAR(60) NOT NULL,
    -- Free-form target reference. Participant identity, recording id, user id, etc.
    target VARCHAR(120) NULL,
    detail TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_room_created (room_id, created_at DESC),
    INDEX idx_audit_actor (actor_id),
    CONSTRAINT fk_audit_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

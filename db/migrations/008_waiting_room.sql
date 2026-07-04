ALTER TABLE rooms
    ADD COLUMN waiting_room_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER recurrence;

CREATE TABLE IF NOT EXISTS waiting_requests (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    room_id BIGINT UNSIGNED NOT NULL,
    -- NULL = guest. Otherwise an authenticated user (non-owner).
    user_id BIGINT UNSIGNED NULL,
    display_name VARCHAR(100) NOT NULL,
    -- pending | approved | denied
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- Random opaque token the guest polls with. Never exposed to other clients.
    request_token VARCHAR(64) NOT NULL UNIQUE,
    -- Populated when admitted; the actual LiveKit JWT to hand back.
    livekit_token TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    decided_at TIMESTAMP NULL,
    INDEX idx_waiting_room_status (room_id, status),
    CONSTRAINT fk_waiting_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    CONSTRAINT fk_waiting_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

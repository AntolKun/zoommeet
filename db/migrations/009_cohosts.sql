-- Co-host designation: room owner can promote one or more authenticated users
-- to share host controls (lock/unlock, mute, kick, manage waiting room,
-- start/stop recording). Owner is implicit and is NEVER stored in this table.
CREATE TABLE IF NOT EXISTS room_cohosts (
    room_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    -- Who granted the privilege. NULL allows the original grantor's account
    -- to be deleted without erasing the grant.
    granted_by BIGINT UNSIGNED NULL,
    granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (room_id, user_id),
    INDEX idx_cohost_user (user_id),
    CONSTRAINT fk_cohost_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    CONSTRAINT fk_cohost_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_cohost_grantor FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

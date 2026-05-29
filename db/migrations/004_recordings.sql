CREATE TABLE IF NOT EXISTS recordings (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    room_id BIGINT UNSIGNED NOT NULL,
    egress_id VARCHAR(64) NOT NULL UNIQUE,
    status VARCHAR(32) NOT NULL,
    started_by BIGINT UNSIGNED NOT NULL,
    file_path VARCHAR(512),
    file_url VARCHAR(512),
    file_size BIGINT UNSIGNED,
    duration_seconds INT UNSIGNED,
    started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP NULL,
    error TEXT,
    INDEX idx_recordings_room (room_id),
    INDEX idx_recordings_status (status),
    CONSTRAINT fk_recordings_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    CONSTRAINT fk_recordings_user FOREIGN KEY (started_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

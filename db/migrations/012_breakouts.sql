-- Breakout rooms: child rooms that exist for the duration of a parent
-- meeting. Each row models a separate LiveKit room (its own slug) but is
-- tied to a parent meeting so the host can list/close them as a group.
CREATE TABLE IF NOT EXISTS breakout_rooms (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    parent_room_id BIGINT UNSIGNED NOT NULL,
    -- Auto-generated slug used as the LiveKit room name; clients navigate
    -- to /room/{slug} to enter the breakout. Unique across all rooms.
    slug VARCHAR(64) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    created_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- NULL = still open. Closing a breakout signals clients to head back.
    closed_at TIMESTAMP NULL,
    INDEX idx_breakout_parent (parent_room_id, created_at DESC),
    CONSTRAINT fk_breakout_parent FOREIGN KEY (parent_room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    CONSTRAINT fk_breakout_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

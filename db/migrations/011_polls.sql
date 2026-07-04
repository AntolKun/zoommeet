-- Polls: simple single-choice voting inside a meeting. Hosts (owner/cohost)
-- create, anyone with room access votes once, host can close to lock results.
CREATE TABLE IF NOT EXISTS polls (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    room_id BIGINT UNSIGNED NOT NULL,
    question VARCHAR(500) NOT NULL,
    created_by BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- NULL = still open for voting. Timestamp = closed.
    closed_at TIMESTAMP NULL,
    INDEX idx_polls_room_created (room_id, created_at DESC),
    CONSTRAINT fk_polls_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
    CONSTRAINT fk_polls_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS poll_options (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    poll_id BIGINT UNSIGNED NOT NULL,
    -- 0-indexed ordering of the option as the host typed it.
    position INT UNSIGNED NOT NULL,
    label VARCHAR(200) NOT NULL,
    INDEX idx_poll_options_poll (poll_id, position),
    CONSTRAINT fk_poll_options_poll FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS poll_votes (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    poll_id BIGINT UNSIGNED NOT NULL,
    option_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- One vote per user per poll. Changing a vote = replace existing row.
    UNIQUE KEY uniq_poll_voter (poll_id, user_id),
    INDEX idx_poll_votes_option (option_id),
    CONSTRAINT fk_poll_votes_poll FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE,
    CONSTRAINT fk_poll_votes_option FOREIGN KEY (option_id) REFERENCES poll_options(id) ON DELETE CASCADE,
    CONSTRAINT fk_poll_votes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

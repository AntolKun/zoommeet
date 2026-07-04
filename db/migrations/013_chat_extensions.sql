-- Chat extensions: soft-delete + edit tracking for messages, plus per-message
-- reactions. Editing/deleting only affects DB rows; live propagation across
-- clients happens over the LiveKit data channel (vc.chat-update topic).
ALTER TABLE messages
    ADD COLUMN edited_at TIMESTAMP NULL AFTER body,
    ADD COLUMN deleted_at TIMESTAMP NULL AFTER edited_at;

CREATE TABLE IF NOT EXISTS message_reactions (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    message_id BIGINT UNSIGNED NOT NULL,
    user_id BIGINT UNSIGNED NOT NULL,
    -- Unicode emoji character(s). 16 chars handles every supported emoji
    -- including ZWJ sequences (👨‍👩‍👧‍👦) and variation selectors.
    emoji VARCHAR(16) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_message_user_emoji (message_id, user_id, emoji),
    INDEX idx_reactions_message (message_id),
    CONSTRAINT fk_reactions_message FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    CONSTRAINT fk_reactions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

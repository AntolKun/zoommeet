-- Reply-to (quote) + host-pinned messages.
-- reply_to_message_id points at any earlier message in the same room; ON DELETE
-- SET NULL keeps the reply visible even if the original is soft-deleted.
-- is_pinned is a boolean flip toggled by hosts; only one client-side conversation
-- needs it — no separate pinned_messages table for now (KISS).
ALTER TABLE messages
    ADD COLUMN reply_to_message_id BIGINT UNSIGNED NULL AFTER attachment_size,
    ADD COLUMN is_pinned TINYINT(1) NOT NULL DEFAULT 0 AFTER reply_to_message_id,
    ADD CONSTRAINT fk_message_reply FOREIGN KEY (reply_to_message_id) REFERENCES messages(id) ON DELETE SET NULL,
    ADD INDEX idx_messages_room_pinned (room_id, is_pinned);

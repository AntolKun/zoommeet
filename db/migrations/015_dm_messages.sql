-- Direct messages: a message with recipient_id is a 1-on-1 chat between
-- sender and that recipient (still scoped to the room). When recipient_id is
-- NULL the message is the existing "all participants" public chat.
ALTER TABLE messages
    ADD COLUMN recipient_id BIGINT UNSIGNED NULL AFTER sender_id,
    ADD INDEX idx_messages_room_dm (room_id, recipient_id, created_at),
    ADD CONSTRAINT fk_messages_recipient
        FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE SET NULL;

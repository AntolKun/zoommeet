ALTER TABLE rooms
    ADD COLUMN scheduled_at DATETIME NULL AFTER is_locked,
    ADD COLUMN duration_minutes INT UNSIGNED NULL AFTER scheduled_at;

CREATE INDEX idx_rooms_scheduled ON rooms(scheduled_at);

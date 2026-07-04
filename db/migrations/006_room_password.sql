ALTER TABLE rooms
    ADD COLUMN password_hash VARCHAR(255) NULL AFTER is_locked;

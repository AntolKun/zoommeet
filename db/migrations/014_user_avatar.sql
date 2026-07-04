-- Avatar URL points at the MinIO 'avatars' bucket (e.g. http://minio:9000/avatars/{user_id}-{rand}.png).
-- Nullable: existing users start without an avatar and fall back to initials.
ALTER TABLE users
    ADD COLUMN avatar_url VARCHAR(500) NULL AFTER display_name;

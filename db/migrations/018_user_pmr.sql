-- Personal Meeting Room: each user has a single permanent room they can hand
-- out as a permalink. Lazy-created on first GET /api/users/me/pmr.
-- ON DELETE SET NULL means dropping the room doesn't cascade-kill the user
-- (we just lose the PMR pointer and the next request re-creates one).
ALTER TABLE users
    ADD COLUMN pmr_room_id BIGINT UNSIGNED NULL AFTER avatar_url,
    ADD CONSTRAINT fk_user_pmr FOREIGN KEY (pmr_room_id) REFERENCES rooms(id) ON DELETE SET NULL;

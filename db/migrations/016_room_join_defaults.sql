-- Owner-configurable defaults for what mic/cam state new joiners start with.
-- Independent of the host's runtime mute-all power: this only affects the
-- INITIAL state when a participant lands in pre-join, they can still override.
-- 0 = default on (mic/cam start enabled), 1 = default off (start muted/dark).
ALTER TABLE rooms
    ADD COLUMN default_mic_off TINYINT(1) NOT NULL DEFAULT 0 AFTER waiting_room_enabled,
    ADD COLUMN default_cam_off TINYINT(1) NOT NULL DEFAULT 0 AFTER default_mic_off;

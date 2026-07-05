-- Webinar mode: only host + cohosts can publish audio/video.
-- Everyone else joins as watch-only (subscribe + chat data channel only).
-- Enforced at token issuance — the LiveKit grants deny publish for audience.
ALTER TABLE rooms
    ADD COLUMN is_webinar TINYINT(1) NOT NULL DEFAULT 0 AFTER default_cam_off;

-- Chat file attachments. Each message can carry one file (image/PDF/doc/etc).
-- All fields nullable so existing text-only messages stay valid.
-- attachment_size in bytes; attachment_type is the MIME type (`image/png`,
-- `application/pdf`, etc.) so the frontend can decide inline preview vs
-- download link.
ALTER TABLE messages
    ADD COLUMN attachment_url VARCHAR(500) NULL AFTER body,
    ADD COLUMN attachment_name VARCHAR(255) NULL AFTER attachment_url,
    ADD COLUMN attachment_type VARCHAR(80) NULL AFTER attachment_name,
    ADD COLUMN attachment_size BIGINT UNSIGNED NULL AFTER attachment_type;

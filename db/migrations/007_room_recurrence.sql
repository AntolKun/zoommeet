-- Recurrence pattern for scheduled rooms.
--   NULL    = one-time meeting (default)
--   'daily' = repeats every day at scheduled_at time
--   'weekly'= repeats every week on the same weekday/time as scheduled_at
ALTER TABLE rooms
    ADD COLUMN recurrence VARCHAR(20) NULL AFTER duration_minutes;

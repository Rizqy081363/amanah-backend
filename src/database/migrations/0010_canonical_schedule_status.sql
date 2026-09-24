-- Canonicalize practitioner schedule persistence status.
-- Session persistence owns only operating state: open or closed.
-- Occupancy is derived from capacity/available slots and appointments.
-- Leave is represented by practitioner_schedule_day_settings and
-- practitioner_leave_periods, not by practitioner_schedule_sessions.status.

UPDATE practitioner_schedule_sessions
SET status = 'closed'
WHERE status IN ('pending', 'leave');

UPDATE practitioner_schedule_sessions
SET status = 'open'
WHERE status = 'full';

ALTER TABLE practitioner_schedule_sessions
  ALTER COLUMN status DROP DEFAULT;

ALTER TYPE schedule_status RENAME TO schedule_status_legacy;

CREATE TYPE schedule_status AS ENUM ('open', 'closed');

ALTER TABLE practitioner_schedule_sessions
  ALTER COLUMN status TYPE schedule_status
  USING status::text::schedule_status;

ALTER TABLE practitioner_schedule_sessions
  ALTER COLUMN status SET DEFAULT 'open';

DROP TYPE schedule_status_legacy;

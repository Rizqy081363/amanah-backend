-- Migration Rollback: 0024_queue_ticketing_engine.down.sql
-- Purpose: Reversible rollback for Phase 2 additive queue-ticketing foundation

DROP INDEX IF EXISTS "queue_tickets_one_active_per_patient";
DROP INDEX IF EXISTS "queue_tickets_one_active_per_room";

DROP TABLE IF EXISTS "queue_notification_outbox";
DROP TABLE IF EXISTS "ticket_event";

-- Revert columns on queue_tickets
ALTER TABLE "queue_tickets"
  DROP COLUMN IF EXISTS "source",
  DROP COLUMN IF EXISTS "legacy_ref",
  DROP COLUMN IF EXISTS "auto_closed",
  DROP COLUMN IF EXISTS "expired_at",
  DROP COLUMN IF EXISTS "moved_to",
  DROP COLUMN IF EXISTS "carried_over",
  DROP COLUMN IF EXISTS "actual_end",
  DROP COLUMN IF EXISTS "actual_start",
  DROP COLUMN IF EXISTS "projected_end",
  DROP COLUMN IF EXISTS "projected_start",
  DROP COLUMN IF EXISTS "patient_id",
  DROP COLUMN IF EXISTS "doctor_id",
  DROP COLUMN IF EXISTS "session_id",
  DROP COLUMN IF EXISTS "category_id";

DROP TABLE IF EXISTS "queue_counter";
DROP TABLE IF EXISTS "clinic_closure";
DROP TABLE IF EXISTS "extra_opening";
DROP TABLE IF EXISTS "shift_exception";
DROP TABLE IF EXISTS "doctor_assignment";
DROP TABLE IF EXISTS "session_schedule";
DROP TABLE IF EXISTS "session_def";

ALTER TABLE "service_categories" DROP COLUMN IF EXISTS "code_prefix";

DROP TABLE IF EXISTS "clinic_setting";

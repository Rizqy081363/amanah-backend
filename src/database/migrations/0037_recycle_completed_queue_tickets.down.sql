-- 0037_recycle_completed_queue_tickets.down.sql
-- Rollback partial index dan kembalikan ke constraint unik absolut lama

DROP INDEX IF EXISTS "queue_tickets_unique_active_number_idx";

ALTER TABLE "queue_tickets"
  ADD CONSTRAINT "queue_tickets_unique_number_per_service_date"
  UNIQUE ("service_id", "queue_date", "queue_number");

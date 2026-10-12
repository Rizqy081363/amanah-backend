-- 0038_scope_active_queue_tickets_by_doctor.down.sql
-- Mengembalikan indeks unik aktif ke cakupan (service_id, queue_date, queue_number) dan menghapus assigned_at

DROP INDEX IF EXISTS "queue_tickets_unique_active_doctor_number_idx";
DROP INDEX IF EXISTS "queue_tickets_unique_active_unassigned_number_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "queue_tickets_unique_active_number_idx"
  ON "queue_tickets" ("service_id", "queue_date", "queue_number")
  WHERE "status" IN ('waiting', 'called', 'in_service');

ALTER TABLE "queue_tickets"
  DROP COLUMN IF EXISTS "assigned_at";

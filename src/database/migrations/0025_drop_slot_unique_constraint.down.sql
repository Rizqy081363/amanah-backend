-- Revert Migration 0025: Restore slot unique constraint on appointments table
CREATE UNIQUE INDEX IF NOT EXISTS "appointments_active_practitioner_slot_unique" 
ON "appointments" ("practitioner_id", "scheduled_date", "scheduled_start_time") 
WHERE practitioner_id IS NOT NULL AND status IN ('booked', 'checked_in', 'waiting', 'in_service');

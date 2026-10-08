-- Migration 0025: Drop slot unique constraint on appointments table
-- Under queue-based ticketing, patients share the session start time and are ordered by atomic queue counter.
DROP INDEX IF EXISTS "appointments_active_practitioner_slot_unique";

-- Migration 0032: Drop legacy schedule capacity columns & constraints
-- As specified in Queue-Based Ticketing blueprints (solusi-antrian-klinik.md & antrian-tanpa-slot-30-menit.md),
-- capacity is no longer a static integer column per doctor/session.
-- Clinic capacity is now derived dynamically at runtime as lanes: min(doctors on duty, rooms in category).

-- 1. Drop check constraints associated with capacity
ALTER TABLE "practitioner_availability" 
  DROP CONSTRAINT IF EXISTS "practitioner_availability_capacity_nonnegative";

ALTER TABLE "practitioner_schedule_sessions" 
  DROP CONSTRAINT IF EXISTS "practitioner_schedule_sessions_capacity_nonnegative";

-- 2. Drop column capacity from practitioner_availability and practitioner_schedule_sessions
ALTER TABLE "practitioner_availability" 
  DROP COLUMN IF EXISTS "capacity";

ALTER TABLE "practitioner_schedule_sessions" 
  DROP COLUMN IF EXISTS "capacity";

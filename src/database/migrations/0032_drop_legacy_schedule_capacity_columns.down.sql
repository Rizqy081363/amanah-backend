-- Revert Migration 0032: Restore legacy schedule capacity columns & constraints

-- 1. Restore column capacity
ALTER TABLE "practitioner_availability" 
  ADD COLUMN IF NOT EXISTS "capacity" integer NOT NULL DEFAULT 0;

ALTER TABLE "practitioner_schedule_sessions" 
  ADD COLUMN IF NOT EXISTS "capacity" integer NOT NULL DEFAULT 0;

-- 2. Restore check constraints
ALTER TABLE "practitioner_availability" 
  ADD CONSTRAINT "practitioner_availability_capacity_nonnegative" 
  CHECK (capacity >= 0);

ALTER TABLE "practitioner_schedule_sessions" 
  ADD CONSTRAINT "practitioner_schedule_sessions_capacity_nonnegative" 
  CHECK (capacity >= 0);

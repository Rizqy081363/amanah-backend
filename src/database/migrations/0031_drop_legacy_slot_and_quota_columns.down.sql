-- Revert Migration 0031: Restore legacy slot and quota columns & constraints

-- 1. Restore columns target_quota and available_slots
ALTER TABLE "practitioner_schedule_day_settings" 
  ADD COLUMN IF NOT EXISTS "target_quota" integer NOT NULL DEFAULT 0;

ALTER TABLE "practitioner_schedule_sessions" 
  ADD COLUMN IF NOT EXISTS "available_slots" integer NOT NULL DEFAULT 0;

-- 2. Restore check constraints
ALTER TABLE "practitioner_schedule_day_settings" 
  ADD CONSTRAINT "practitioner_day_settings_target_quota_nonnegative" 
  CHECK (target_quota >= 0);

ALTER TABLE "practitioner_schedule_sessions" 
  ADD CONSTRAINT "practitioner_schedule_sessions_available_lte_capacity" 
  CHECK (available_slots <= capacity);

ALTER TABLE "practitioner_schedule_sessions" 
  ADD CONSTRAINT "practitioner_schedule_sessions_available_slots_nonnegative" 
  CHECK (available_slots >= 0);

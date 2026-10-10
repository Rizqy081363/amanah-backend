-- Migration 0031: Drop legacy slot and quota columns & constraints
-- As part of migrating to queue-based ticketing, fixed 30-minute slot availability
-- and day target quota paradigms are removed from schedule sessions and day settings.

-- 1. Drop check constraints associated with target_quota and available_slots
ALTER TABLE "practitioner_schedule_day_settings" 
  DROP CONSTRAINT IF EXISTS "practitioner_day_settings_target_quota_nonnegative";

ALTER TABLE "practitioner_schedule_sessions" 
  DROP CONSTRAINT IF EXISTS "practitioner_schedule_sessions_slots_within_capacity";

ALTER TABLE "practitioner_schedule_sessions" 
  DROP CONSTRAINT IF EXISTS "practitioner_schedule_sessions_available_slots_nonnegative";

ALTER TABLE "practitioner_schedule_sessions" 
  DROP CONSTRAINT IF EXISTS "practitioner_schedule_sessions_available_lte_capacity";

-- 2. Drop columns target_quota and available_slots
ALTER TABLE "practitioner_schedule_day_settings" 
  DROP COLUMN IF EXISTS "target_quota";

ALTER TABLE "practitioner_schedule_sessions" 
  DROP COLUMN IF EXISTS "available_slots";

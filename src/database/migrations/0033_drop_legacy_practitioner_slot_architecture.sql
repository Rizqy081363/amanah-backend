-- Migration 0033: Drop legacy practitioner slot architecture tables and relations
-- As specified in Queue-Based Ticketing blueprints (feature-spec/queue-base-ticketing/*.md),
-- schedule slots, static capacities, and doctor-owned availability are fully replaced by clinic session schedules
-- (session_def, session_schedule), doctor assignments (doctor_assignment), shift exceptions (shift_exception),
-- and unified closures (clinic_closure).

-- 1. Drop foreign key constraint, index, and column schedule_session_id from appointments
ALTER TABLE "appointments" DROP CONSTRAINT IF EXISTS "appointments_schedule_session_id_fkey";
DROP INDEX IF EXISTS "appointments_schedule_session_idx";
ALTER TABLE "appointments" DROP COLUMN IF EXISTS "schedule_session_id";

-- 2. Drop legacy practitioner schedule & slot tables
DROP TABLE IF EXISTS "practitioner_schedule_sessions" CASCADE;
DROP TABLE IF EXISTS "practitioner_schedule_day_settings" CASCADE;
DROP TABLE IF EXISTS "practitioner_schedule_closures" CASCADE;
DROP TABLE IF EXISTS "practitioner_availability" CASCADE;
DROP TABLE IF EXISTS "practitioner_leave_periods" CASCADE;
DROP TABLE IF EXISTS "schedule_reschedule_events" CASCADE;
DROP TABLE IF EXISTS "clinic_schedule_policies" CASCADE;

-- Migration 0051: Attendance check-out window and early departure tracking
-- 1. Alter staff_attendance_records to track early departure
ALTER TABLE "staff_attendance_records"
  ADD COLUMN IF NOT EXISTS "is_early_departure" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS "idx_staff_attendance_early_departure"
  ON "staff_attendance_records" ("is_early_departure")
  WHERE "is_early_departure" = TRUE;

-- 2. Seed dynamic attendance check-out window & policy settings into clinic_setting
INSERT INTO "clinic_setting" ("key", "scope_type", "value")
VALUES
  ('attendance.check_out_window_minutes_before', 'global', '30'::jsonb),
  ('attendance.early_checkout_requires_notes', 'global', 'true'::jsonb)
ON CONFLICT ("key") DO NOTHING;

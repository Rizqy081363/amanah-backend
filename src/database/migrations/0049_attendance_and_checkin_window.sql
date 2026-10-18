-- Migration 0049: Attendance check-in window and replacement linkage
-- 1. Alter staff_attendance_records to link to replacement opportunities and session definitions
ALTER TABLE "staff_attendance_records"
  ADD COLUMN IF NOT EXISTS "replacement_opportunity_id" UUID REFERENCES "replacement_opportunities"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "session_id" UUID REFERENCES "session_def"("id") ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "validated_duration_hours" NUMERIC(5, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS "is_replacement" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS "idx_staff_attendance_replacement"
  ON "staff_attendance_records" ("replacement_opportunity_id")
  WHERE "replacement_opportunity_id" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_staff_attendance_session"
  ON "staff_attendance_records" ("session_id")
  WHERE "session_id" IS NOT NULL;

-- 2. Seed attendance and check-in window settings into clinic_setting
INSERT INTO "clinic_setting" ("key", "scope_type", "value")
VALUES
  ('attendance.check_in_window_minutes_before', 'global', '30'::jsonb),
  ('attendance.check_in_window_minutes_after', 'global', '60'::jsonb),
  ('attendance.overtime_enabled', 'global', 'true'::jsonb)
ON CONFLICT ("key") DO NOTHING;

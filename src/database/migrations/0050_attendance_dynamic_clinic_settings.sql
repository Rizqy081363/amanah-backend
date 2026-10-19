-- Migration 0050: Register Dynamic Clinic Settings for Attendance and Shift Management
INSERT INTO "clinic_setting" ("key", "scope_type", "value")
VALUES
  ('attendance.late_tolerance_minutes', 'global', '15'::jsonb),
  ('attendance.qr_rotation_seconds', 'global', '30'::jsonb)
ON CONFLICT ("key") DO NOTHING;

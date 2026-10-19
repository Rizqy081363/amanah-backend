-- Migration 0052: Register Dynamic Clinic Settings for Roster Break and Net Work Hours Governance
INSERT INTO "clinic_setting" ("key", "scope_type", "value")
VALUES
  ('roster.break_duration_minutes', 'global', '30'::jsonb),
  ('roster.is_break_paid', 'global', 'false'::jsonb),
  ('roster.break_deduction_scope', 'global', '"per_session"'::jsonb)
ON CONFLICT ("key") DO NOTHING;

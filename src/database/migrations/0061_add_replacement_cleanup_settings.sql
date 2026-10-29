-- 0061_add_replacement_cleanup_settings.sql
-- Add default clinical settings for automated replacement opportunity expiration and cleanup cron

INSERT INTO clinic_setting (key, scope_type, value, updated_at)
VALUES 
  ('replacement.auto_expire_hours_before_shift', 'global', '2'::jsonb, NOW()),
  ('replacement.cleanup_cron_expression', 'global', '"0 * * * *"'::jsonb, NOW())
ON CONFLICT (key) DO NOTHING;

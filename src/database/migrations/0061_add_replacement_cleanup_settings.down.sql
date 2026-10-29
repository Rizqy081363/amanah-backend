-- 0061_add_replacement_cleanup_settings.down.sql
DELETE FROM clinic_setting 
WHERE key IN ('replacement.auto_expire_hours_before_shift', 'replacement.cleanup_cron_expression');

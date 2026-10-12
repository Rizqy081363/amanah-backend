-- 0036_add_queue_check_in_window_hours_setting.sql
-- Menambahkan konfigurasi batas waktu check-in (queue.check_in_window_hours) ke clinic_setting

INSERT INTO "clinic_setting" ("key", "scope_type", "value") VALUES
  ('queue.check_in_window_hours', 'global', '24'::jsonb)
ON CONFLICT ("key") DO NOTHING;

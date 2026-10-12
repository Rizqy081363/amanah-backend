-- 0036_add_queue_check_in_window_hours_setting.down.sql
DELETE FROM "clinic_setting" WHERE "key" = 'queue.check_in_window_hours';

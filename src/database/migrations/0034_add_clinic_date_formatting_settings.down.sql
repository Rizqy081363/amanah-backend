-- 0034_add_clinic_date_formatting_settings.down.sql
-- Rollback penambahan konfigurasi formatting tanggal & waktu dinamis

DELETE FROM "clinic_setting" WHERE "key" IN ('clinic.date_format_style', 'clinic.time_format_style');

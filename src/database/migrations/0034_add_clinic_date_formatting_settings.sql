-- 0034_add_clinic_date_formatting_settings.sql
-- Menambahkan konfigurasi formatting tanggal & waktu dinamis ke registry clinic_setting

INSERT INTO "clinic_setting" ("key", "scope_type", "value") VALUES
  ('clinic.date_format_style', 'global', '"human_full"'::jsonb),
  ('clinic.time_format_style', 'global', '"24h"'::jsonb)
ON CONFLICT ("key") DO UPDATE
  SET "value" = EXCLUDED."value",
      "updated_at" = now();

-- 0035_add_master_day_is_active_and_sync_night_shift.sql
-- 1. Tambah kolom is_active ke master_day jika belum ada
ALTER TABLE "master_day" ADD COLUMN IF NOT EXISTS "is_active" BOOLEAN NOT NULL DEFAULT TRUE;

-- 2. Sinkronisasi jam selesai shift malam pada session_schedule ke 24:00:00 (sesuai session_def 18:00:00 - 24:00:00)
UPDATE "session_schedule"
SET "ends_at" = '24:00:00',
    "updated_at" = NOW()
WHERE "session_id" IN (
  SELECT "id" FROM "session_def" WHERE "code" = 'night'
)
AND "ends_at" = '21:00:00';

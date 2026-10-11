-- 0035_add_master_day_is_active_and_sync_night_shift.down.sql
ALTER TABLE "master_day" DROP COLUMN IF EXISTS "is_active";

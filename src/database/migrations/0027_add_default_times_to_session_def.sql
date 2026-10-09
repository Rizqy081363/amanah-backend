-- Migration 0027: Add canonical default shift hours to session_def and physically populate all 28 weekly schedule slots

-- 1. Add default time columns to session_def
ALTER TABLE "session_def" ADD COLUMN IF NOT EXISTS "default_starts_at" time;
ALTER TABLE "session_def" ADD COLUMN IF NOT EXISTS "default_ends_at" time;

-- 2. Populate canonical operational boundaries based on shift code
UPDATE "session_def" SET "default_starts_at" = '00:00:00', "default_ends_at" = '06:00:00' WHERE "code" = 'early_morning';
UPDATE "session_def" SET "default_starts_at" = '06:00:00', "default_ends_at" = '12:00:00' WHERE "code" = 'morning';
UPDATE "session_def" SET "default_starts_at" = '12:00:00', "default_ends_at" = '18:00:00' WHERE "code" = 'afternoon';
UPDATE "session_def" SET "default_starts_at" = '18:00:00', "default_ends_at" = '24:00:00' WHERE "code" = 'night';

-- Enforce NOT NULL constraint now that columns are populated
ALTER TABLE "session_def" ALTER COLUMN "default_starts_at" SET NOT NULL;
ALTER TABLE "session_def" ALTER COLUMN "default_ends_at" SET NOT NULL;

-- 3. Physically backfill all missing (session_id, dow) slots in session_schedule
-- Ensuring all 28 slots (7 days x 4 shifts) exist in database without needing fake synthesis in code
INSERT INTO "session_schedule" ("id", "session_id", "dow", "starts_at", "ends_at", "is_active", "created_at", "updated_at")
SELECT
  gen_random_uuid(),
  sd.id,
  d.dow,
  sd.default_starts_at,
  sd.default_ends_at,
  FALSE,
  NOW(),
  NOW()
FROM "session_def" sd
CROSS JOIN (
  SELECT unnest(ARRAY[0, 1, 2, 3, 4, 5, 6]) AS dow
) d
WHERE NOT EXISTS (
  SELECT 1 FROM "session_schedule" ss
  WHERE ss.session_id = sd.id AND ss.dow = d.dow
);

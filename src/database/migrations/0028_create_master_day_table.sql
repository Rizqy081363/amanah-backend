-- Migration 0028: Create master_day table, seed canonical days, and enforce foreign keys on session_schedule and doctor_assignment

-- 1. Create master_day table
CREATE TABLE IF NOT EXISTS "master_day" (
  "dow" INT PRIMARY KEY CHECK ("dow" >= 0 AND "dow" <= 6),
  "code" TEXT NOT NULL UNIQUE,
  "name_id" TEXT NOT NULL,
  "name_en" TEXT NOT NULL,
  "short_name_id" VARCHAR(10) NOT NULL,
  "short_name_en" VARCHAR(10) NOT NULL,
  "sort_order" INT NOT NULL UNIQUE,
  "is_weekend" BOOLEAN NOT NULL DEFAULT FALSE,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Seed canonical 7 days of the week (Monday-first operational sort order)
INSERT INTO "master_day" ("dow", "code", "name_id", "name_en", "short_name_id", "short_name_en", "sort_order", "is_weekend")
VALUES
  (1, 'monday', 'Senin', 'Monday', 'Sen', 'Mon', 1, FALSE),
  (2, 'tuesday', 'Selasa', 'Tuesday', 'Sel', 'Tue', 2, FALSE),
  (3, 'wednesday', 'Rabu', 'Wednesday', 'Rab', 'Wed', 3, FALSE),
  (4, 'thursday', 'Kamis', 'Thursday', 'Kam', 'Thu', 4, FALSE),
  (5, 'friday', 'Jumat', 'Friday', 'Jum', 'Fri', 5, FALSE),
  (6, 'saturday', 'Sabtu', 'Saturday', 'Sab', 'Sat', 6, TRUE),
  (0, 'sunday', 'Minggu', 'Sunday', 'Min', 'Sun', 7, TRUE)
ON CONFLICT ("dow") DO UPDATE SET
  "code" = EXCLUDED."code",
  "name_id" = EXCLUDED."name_id",
  "name_en" = EXCLUDED."name_en",
  "short_name_id" = EXCLUDED."short_name_id",
  "short_name_en" = EXCLUDED."short_name_en",
  "sort_order" = EXCLUDED."sort_order",
  "is_weekend" = EXCLUDED."is_weekend",
  "updated_at" = NOW();

-- 3. Enforce Foreign Key constraint on session_schedule.dow
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_session_schedule_dow'
  ) THEN
    ALTER TABLE "session_schedule"
      ADD CONSTRAINT "fk_session_schedule_dow"
      FOREIGN KEY ("dow")
      REFERENCES "master_day"("dow")
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;
END $$;

-- 4. Enforce Foreign Key constraint on doctor_assignment.dow
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_doctor_assignment_dow'
  ) THEN
    ALTER TABLE "doctor_assignment"
      ADD CONSTRAINT "fk_doctor_assignment_dow"
      FOREIGN KEY ("dow")
      REFERENCES "master_day"("dow")
      ON UPDATE CASCADE
      ON DELETE RESTRICT;
  END IF;
END $$;

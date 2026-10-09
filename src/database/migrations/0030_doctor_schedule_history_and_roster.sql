DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'doctor_schedule_history_action') THEN
    CREATE TYPE "doctor_schedule_history_action" AS ENUM (
      'open_schedule',
      'close_schedule',
      'assign_roster',
      'remove_roster',
      'override_date'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "doctor_schedule_status_history" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "doctor_id" UUID NOT NULL REFERENCES "practitioners"("id") ON DELETE CASCADE,
  "schedule_date" DATE,
  "session_id" UUID REFERENCES "session_def"("id") ON DELETE SET NULL,
  "dow" INT REFERENCES "master_day"("dow") ON DELETE RESTRICT,
  "action" "doctor_schedule_history_action" NOT NULL,
  "previous_status" VARCHAR(20),
  "new_status" VARCHAR(20),
  "reason" TEXT,
  "metadata" JSONB DEFAULT '{}'::jsonb,
  "changed_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "idx_doctor_sched_hist_doctor_date" 
  ON "doctor_schedule_status_history" ("doctor_id", "schedule_date" DESC);

CREATE INDEX IF NOT EXISTS "idx_doctor_sched_hist_created_at" 
  ON "doctor_schedule_status_history" ("created_at" DESC);

ALTER TABLE "doctor_assignment" ALTER COLUMN "category_id" DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_doctor_assignment_doctor_session_dow_active"
  ON "doctor_assignment" ("doctor_id", "session_id", "dow")
  WHERE "is_active" = TRUE;

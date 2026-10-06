ALTER TYPE "appointment_status" ADD VALUE IF NOT EXISTS 'late';
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "queue_number" integer;
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "estimated_start_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "estimated_end_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "actual_started_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "actual_completed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "last_called_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "appointments"
SET 
  "actual_started_at" = COALESCE("actual_started_at", "started_at"),
  "actual_completed_at" = COALESCE("actual_completed_at", "completed_at"),
  "estimated_start_at" = COALESCE("estimated_start_at", ("scheduled_date"::text || ' ' || "scheduled_start_time"::text)::timestamptz),
  "estimated_end_at" = COALESCE("estimated_end_at", ("scheduled_date"::text || ' ' || "scheduled_start_time"::text)::timestamptz + interval '30 minutes');
--> statement-breakpoint
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY practitioner_id, scheduled_date ORDER BY scheduled_start_time ASC, created_at ASC) as rn
  FROM "appointments"
  WHERE "practitioner_id" IS NOT NULL
)
UPDATE "appointments" a
SET "queue_number" = ranked.rn
FROM ranked
WHERE a.id = ranked.id AND a.queue_number IS NULL;
--> statement-breakpoint
WITH unranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY scheduled_date ORDER BY scheduled_start_time ASC, created_at ASC) as rn
  FROM "appointments"
  WHERE "queue_number" IS NULL
)
UPDATE "appointments" a
SET "queue_number" = unranked.rn
FROM unranked
WHERE a.id = unranked.id AND a.queue_number IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "appointments_practitioner_date_queue_unique" ON "appointments" USING btree ("practitioner_id", "scheduled_date", "queue_number") WHERE "practitioner_id" IS NOT NULL AND "queue_number" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "appointments_waiting_lateness_idx" ON "appointments" ("estimated_start_at") WHERE "status" IN ('waiting', 'booked');
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_actual_time_order') THEN
    ALTER TABLE "appointments" ADD CONSTRAINT "appointments_actual_time_order" CHECK ("actual_completed_at" IS NULL OR "actual_started_at" IS NULL OR "actual_completed_at" >= "actual_started_at");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_in_service_started_at') THEN
    ALTER TABLE "appointments" ADD CONSTRAINT "appointments_in_service_started_at" CHECK ("status" != 'in_service' OR "actual_started_at" IS NOT NULL);
  END IF;
END $$;

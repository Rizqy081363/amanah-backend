ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "audience" text DEFAULT 'clinic';
CREATE INDEX IF NOT EXISTS "notifications_audience_idx" ON "notifications" ("audience");

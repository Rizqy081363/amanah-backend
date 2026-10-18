-- Migration 0046: Enhance leave requests and add leave request sessions
-- 1. Add scope and decision_source to staff_leave_requests
ALTER TABLE "staff_leave_requests"
  ADD COLUMN IF NOT EXISTS "scope" VARCHAR(20) NOT NULL DEFAULT 'full_day',
  ADD COLUMN IF NOT EXISTS "decision_source" VARCHAR(20) DEFAULT 'admin';

DO $$ BEGIN
  ALTER TABLE "staff_leave_requests"
    ADD CONSTRAINT "staff_leave_requests_scope_check" CHECK ("scope" IN ('session', 'full_day'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "staff_leave_requests"
    ADD CONSTRAINT "staff_leave_requests_decision_source_check" CHECK ("decision_source" IN ('admin', 'auto'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Create leave_request_sessions table
CREATE TABLE IF NOT EXISTS "leave_request_sessions" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "leave_request_id" UUID NOT NULL REFERENCES "staff_leave_requests"("id") ON DELETE CASCADE,
  "session_id" UUID NOT NULL REFERENCES "session_def"("id") ON DELETE CASCADE,
  "work_date" DATE NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "leave_request_sessions_unique" UNIQUE ("leave_request_id", "session_id", "work_date")
);

CREATE INDEX IF NOT EXISTS "idx_leave_request_sessions_date"
  ON "leave_request_sessions" ("work_date", "session_id");
CREATE INDEX IF NOT EXISTS "idx_leave_request_sessions_request"
  ON "leave_request_sessions" ("leave_request_id");

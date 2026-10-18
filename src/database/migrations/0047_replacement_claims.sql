-- Migration 0047: Create replacement_opportunities table
CREATE TABLE IF NOT EXISTS "replacement_opportunities" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "leave_request_id" UUID NOT NULL REFERENCES "staff_leave_requests"("id") ON DELETE CASCADE,
  "session_id" UUID NOT NULL REFERENCES "session_def"("id") ON DELETE CASCADE,
  "work_date" DATE NOT NULL,
  "original_staff_profile_id" UUID NOT NULL REFERENCES "staff_profiles"("id") ON DELETE CASCADE,
  "original_practitioner_id" UUID REFERENCES "practitioners"("id") ON DELETE SET NULL,
  "claimed_by_staff_profile_id" UUID REFERENCES "staff_profiles"("id") ON DELETE SET NULL,
  "claimed_by_practitioner_id" UUID REFERENCES "practitioners"("id") ON DELETE SET NULL,
  "claimed_at" TIMESTAMPTZ,
  "status" VARCHAR(20) NOT NULL DEFAULT 'open',
  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "replacement_opportunities_status_check" CHECK ("status" IN ('open', 'claimed', 'completed', 'cancelled')),
  CONSTRAINT "replacement_opportunities_claim_consistency" CHECK (
    ("status" = 'open' AND "claimed_by_staff_profile_id" IS NULL AND "claimed_at" IS NULL) OR
    ("status" IN ('claimed', 'completed') AND "claimed_by_staff_profile_id" IS NOT NULL AND "claimed_at" IS NOT NULL) OR
    ("status" = 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS "idx_replacement_opp_date_status"
  ON "replacement_opportunities" ("work_date", "status");
CREATE INDEX IF NOT EXISTS "idx_replacement_opp_leave_req"
  ON "replacement_opportunities" ("leave_request_id");
CREATE INDEX IF NOT EXISTS "idx_replacement_opp_claimed_staff"
  ON "replacement_opportunities" ("claimed_by_staff_profile_id")
  WHERE "claimed_by_staff_profile_id" IS NOT NULL;

-- Migration 0040: Staff demographics, invitations, and independent staff roster
-- 1. Add demographic fields to staff_profiles
ALTER TABLE "staff_profiles"
  ADD COLUMN IF NOT EXISTS "birth_place" TEXT,
  ADD COLUMN IF NOT EXISTS "birth_date" DATE,
  ADD COLUMN IF NOT EXISTS "gender" "gender",
  ADD COLUMN IF NOT EXISTS "national_id_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "national_id_encrypted" TEXT;

CREATE INDEX IF NOT EXISTS "staff_profiles_national_id_hash_idx"
  ON "staff_profiles" ("national_id_hash")
  WHERE "national_id_hash" IS NOT NULL;

-- 2. Create staff_invitations table
CREATE TABLE IF NOT EXISTS "staff_invitations" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "email" CITEXT NOT NULL,
  "role_code" TEXT NOT NULL,
  "staff_type" "staff_type" NOT NULL,
  "token_hash" TEXT NOT NULL,
  "temporary_password_hash" TEXT,
  "invited_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
  "expires_at" TIMESTAMPTZ NOT NULL,
  "accepted_at" TIMESTAMPTZ,
  "metadata" JSONB DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "staff_invitations_status_check" CHECK ("status" IN ('pending', 'accepted', 'expired', 'revoked'))
);

CREATE INDEX IF NOT EXISTS "idx_staff_invitations_email" ON "staff_invitations" ("email");
CREATE INDEX IF NOT EXISTS "idx_staff_invitations_status" ON "staff_invitations" ("status");
CREATE INDEX IF NOT EXISTS "idx_staff_invitations_expires" ON "staff_invitations" ("expires_at");

-- 3. Create staff_roster table (independent operational schedule, completely decoupled from practitioners)
CREATE TABLE IF NOT EXISTS "staff_roster" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "staff_profile_id" UUID NOT NULL REFERENCES "staff_profiles"("id") ON DELETE CASCADE,
  "session_id" UUID NOT NULL REFERENCES "session_def"("id") ON DELETE CASCADE,
  "dow" INT NOT NULL REFERENCES "master_day"("dow") ON DELETE RESTRICT,
  "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
  "notes" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_staff_roster_profile_session_dow_active"
  ON "staff_roster" ("staff_profile_id", "session_id", "dow")
  WHERE "is_active" = TRUE;

CREATE INDEX IF NOT EXISTS "idx_staff_roster_profile"
  ON "staff_roster" ("staff_profile_id");

-- 4. Triggers for updated_at
DROP TRIGGER IF EXISTS set_updated_at ON "staff_invitations";
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON "staff_invitations"
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON "staff_roster";
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON "staff_roster"
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

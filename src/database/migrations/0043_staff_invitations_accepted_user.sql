-- Migration 0043: Staff invitations accepted user and pending uniqueness constraint
ALTER TABLE "staff_invitations"
  ADD COLUMN IF NOT EXISTS "accepted_user_id" UUID REFERENCES "users"("id") ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_staff_invitations_pending"
  ON "staff_invitations" ("email", "role_code")
  WHERE "status" = 'pending';

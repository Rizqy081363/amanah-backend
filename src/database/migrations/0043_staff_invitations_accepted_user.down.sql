-- Migration 0043 Down: Drop accepted_user_id and uq_staff_invitations_pending
DROP INDEX IF EXISTS "uq_staff_invitations_pending";

ALTER TABLE "staff_invitations"
  DROP COLUMN IF EXISTS "accepted_user_id";

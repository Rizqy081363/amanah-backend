-- Rollback Migration 0040
DROP TABLE IF EXISTS "staff_roster";
DROP TABLE IF EXISTS "staff_invitations";

ALTER TABLE "staff_profiles"
  DROP COLUMN IF EXISTS "national_id_encrypted",
  DROP COLUMN IF EXISTS "national_id_hash",
  DROP COLUMN IF EXISTS "gender",
  DROP COLUMN IF EXISTS "birth_date",
  DROP COLUMN IF EXISTS "birth_place";

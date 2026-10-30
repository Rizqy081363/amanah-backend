-- Migration 0062 Down: Rollback Hierarchical Dynamic RBAC
CREATE TYPE staff_type AS ENUM ('doctor', 'midwife', 'worker');

ALTER TABLE staff_profiles ADD COLUMN IF NOT EXISTS staff_type staff_type;
CREATE INDEX IF NOT EXISTS staff_profiles_type_status_idx ON staff_profiles(staff_type, status);
DROP INDEX IF EXISTS staff_profiles_status_idx;
ALTER TABLE staff_profiles DROP COLUMN IF EXISTS role_id;

ALTER TABLE staff_invitations ADD COLUMN IF NOT EXISTS staff_type staff_type;
ALTER TABLE staff_invitations DROP COLUMN IF EXISTS role_id;

ALTER TABLE compensation_rates ADD COLUMN IF NOT EXISTS category VARCHAR(30);
ALTER TABLE compensation_rates DROP CONSTRAINT IF EXISTS idx_compensation_rates_active_role;
DROP INDEX IF EXISTS idx_compensation_rates_active_role;
ALTER TABLE compensation_rates DROP COLUMN IF EXISTS role_id;

ALTER TABLE roles DROP CONSTRAINT IF EXISTS roles_tier_check;
DROP INDEX IF EXISTS roles_parent_role_id_idx;
DROP INDEX IF EXISTS roles_tier_idx;
ALTER TABLE roles DROP COLUMN IF EXISTS parent_role_id;
ALTER TABLE roles DROP COLUMN IF EXISTS tier;
ALTER TABLE roles DROP COLUMN IF EXISTS is_clinical;

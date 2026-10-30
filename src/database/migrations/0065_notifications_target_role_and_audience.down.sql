-- Migration 0065 Down: Revert target_role_id and audience constraint

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_audience_check;

DROP INDEX IF EXISTS idx_notifications_target_role;

ALTER TABLE notifications 
  DROP COLUMN IF EXISTS target_role_id CASCADE;

ALTER TABLE notifications 
  ALTER COLUMN audience DROP NOT NULL,
  ALTER COLUMN audience SET DEFAULT 'clinic';

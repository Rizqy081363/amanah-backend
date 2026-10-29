-- Revert Migration 0060: Remove period_policy from leave_policy and clinic_setting

ALTER TABLE leave_policy 
DROP CONSTRAINT IF EXISTS leave_policy_period_policy_check;

ALTER TABLE leave_policy 
DROP COLUMN IF EXISTS period_policy;

DELETE FROM clinic_setting 
WHERE key = 'leave.period_policy';

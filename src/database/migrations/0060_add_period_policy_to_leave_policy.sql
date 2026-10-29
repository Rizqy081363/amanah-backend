-- Migration 0060: Add period_policy to leave_policy and sync clinic_setting
-- Allows clinic administration to configure between flexible (non_overlapping) and strict (previous_period_must_finish) leave request policies.

ALTER TABLE leave_policy 
ADD COLUMN IF NOT EXISTS period_policy VARCHAR(40) DEFAULT 'non_overlapping' NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'leave_policy_period_policy_check'
    ) THEN
        ALTER TABLE leave_policy ADD CONSTRAINT leave_policy_period_policy_check
        CHECK (period_policy IN ('non_overlapping', 'previous_period_must_finish'));
    END IF;
END $$;

INSERT INTO clinic_setting (key, scope_type, value, updated_at)
VALUES ('leave.period_policy', 'global', '"non_overlapping"', NOW())
ON CONFLICT (key) DO UPDATE 
SET value = EXCLUDED.value, updated_at = NOW();

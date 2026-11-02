-- Migration Down 0080: Drop Appointment Change Proposals and Expiration Settings

DROP TRIGGER IF EXISTS set_appointment_change_proposals_updated_at ON appointment_change_proposals;
DROP TABLE IF EXISTS appointment_change_proposals CASCADE;

DELETE FROM clinic_setting WHERE key IN (
  'proposal.expiration_lead_minutes',
  'proposal.sweeper_cron_expression',
  'proposal.max_pending_per_appointment'
);

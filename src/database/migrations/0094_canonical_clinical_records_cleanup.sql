ALTER TABLE maternal_health_intakes
  DROP COLUMN IF EXISTS intake_submission_id CASCADE;

ALTER TABLE child_immunization_intakes
  DROP COLUMN IF EXISTS intake_submission_id CASCADE;

ALTER TABLE maternal_health_intakes
  ADD COLUMN IF NOT EXISTS intake_submission_id uuid REFERENCES medical_intake_submissions(id) ON DELETE CASCADE;

ALTER TABLE child_immunization_intakes
  ADD COLUMN IF NOT EXISTS intake_submission_id uuid REFERENCES medical_intake_submissions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS maternal_health_intakes_submission_idx ON maternal_health_intakes(intake_submission_id);
CREATE INDEX IF NOT EXISTS child_immunization_intakes_submission_idx ON child_immunization_intakes(intake_submission_id);

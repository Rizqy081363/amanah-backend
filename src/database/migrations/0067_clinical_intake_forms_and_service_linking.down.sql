-- Migration 0067 Down: Revert Dynamic Clinical Intake Forms Registry
ALTER TABLE clinic_services
  ADD COLUMN IF NOT EXISTS medical_flow medical_flow_type;

DROP INDEX IF EXISTS idx_clinic_services_intake_form_id;

ALTER TABLE clinic_services
  DROP COLUMN IF EXISTS intake_form_id;

DROP TABLE IF EXISTS clinical_intake_forms;

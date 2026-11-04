-- Down Migration: 0083_canonical_immunization_clinical_records.down.sql

ALTER TABLE child_immunization_entries
  DROP CONSTRAINT IF EXISTS child_imm_entries_patient_row_uniq;

DROP INDEX IF EXISTS child_imm_entries_admin_by_idx;
DROP INDEX IF EXISTS child_imm_entries_row_idx;
DROP INDEX IF EXISTS child_imm_entries_appt_idx;

ALTER TABLE child_immunization_entries
  DROP COLUMN IF EXISTS row_index,
  DROP COLUMN IF EXISTS vaccine_name,
  DROP COLUMN IF EXISTS age_display,
  DROP COLUMN IF EXISTS fever,
  DROP COLUMN IF EXISTS cough,
  DROP COLUMN IF EXISTS runny_nose,
  DROP COLUMN IF EXISTS weight_kg,
  DROP COLUMN IF EXISTS height_cm,
  DROP COLUMN IF EXISTS head_circumference_cm,
  DROP COLUMN IF EXISTS temperature_celsius,
  DROP COLUMN IF EXISTS planning,
  DROP COLUMN IF EXISTS appointment_id,
  DROP COLUMN IF EXISTS administered_by;

ALTER TABLE child_immunization_entries
  ADD COLUMN IF NOT EXISTS given_month varchar(16),
  ADD COLUMN IF NOT EXISTS age_estimate_months integer,
  ADD COLUMN IF NOT EXISTS date_precision varchar(32),
  ADD COLUMN IF NOT EXISTS review_reasons jsonb;

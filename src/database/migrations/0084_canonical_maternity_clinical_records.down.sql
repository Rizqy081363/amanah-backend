-- Down Migration: 0084_canonical_maternity_clinical_records.down.sql
ALTER TABLE maternal_health_intakes
  ADD COLUMN IF NOT EXISTS disease_history jsonb DEFAULT '{}'::jsonb NOT NULL;

DROP INDEX IF EXISTS idx_maternal_intakes_patient_date;

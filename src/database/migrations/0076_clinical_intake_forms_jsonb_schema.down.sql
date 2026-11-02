-- Down migration 0076

ALTER TABLE clinical_intake_forms 
  DROP COLUMN IF EXISTS schema;

-- Migration Down: 0082_restore_immunization_vaccine_data_schema.down.sql
-- Rollback vaccineHistory step from clinical_intake_forms (code = 'immunization').

UPDATE clinical_intake_forms
SET
  schema = jsonb_set(
    schema,
    '{steps}',
    (
      SELECT jsonb_agg(step)
      FROM jsonb_array_elements(schema->'steps') AS step
      WHERE step->>'id' != 'vaccineHistory'
    )
  ),
  updated_at = NOW()
WHERE code = 'immunization';

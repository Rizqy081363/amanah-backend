-- Migration: 0079_eliminate_hardcoded_intake_schema_choices.sql
-- Eliminates hardcoded choices in clinical_intake_forms schemas in favor of dynamic dataSource catalogs.
-- Any field possessing a 'dataSource' attribute must have its 'choices' array emptied to []
-- so that option resolution is 100% dynamic and database-driven.

UPDATE clinical_intake_forms
SET schema = (
  SELECT jsonb_set(
    schema,
    '{steps}',
    (
      SELECT jsonb_agg(
        jsonb_set(
          step,
          '{fields}',
          (
            SELECT jsonb_agg(
              CASE 
                WHEN field->'dataSource' IS NOT NULL THEN jsonb_set(field, '{choices}', '[]'::jsonb)
                ELSE field
              END
            )
            FROM jsonb_array_elements(step->'fields') AS field
          )
        )
      )
      FROM jsonb_array_elements(schema->'steps') AS step
    )
  )
);

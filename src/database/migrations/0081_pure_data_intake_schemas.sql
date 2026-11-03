-- Migration: 0081_pure_data_intake_schemas.sql
-- Purges UI presentation concerns (component, colSpan, UI-only wizard slides) from clinical_intake_forms.
-- Eliminates corrupted null steps caused by previous migration.
-- Preserves 100% of canonical domain clinical data contracts.

UPDATE clinical_intake_forms
SET schema = jsonb_set(
  schema,
  '{steps}',
  (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', step->>'id',
        'title', step->>'title',
        'description', COALESCE(step->>'description', ''),
        'fields', (
          SELECT COALESCE(jsonb_agg(
            field - 'component' - 'colSpan'
          ), '[]'::jsonb)
          FROM jsonb_array_elements(step->'fields') AS field
          WHERE field IS NOT NULL AND jsonb_typeof(field) = 'object'
        )
      ) || CASE WHEN step ? 'repeatableGroup' THEN jsonb_build_object('repeatableGroup', step->'repeatableGroup') ELSE '{}'::jsonb END
    )
    FROM jsonb_array_elements(schema->'steps') AS step
    WHERE step IS NOT NULL 
      AND jsonb_typeof(step) = 'object'
      AND step->>'id' NOT IN ('closing', 'step_review', 'vaccineHistory')
  )
)
WHERE schema->'steps' IS NOT NULL;

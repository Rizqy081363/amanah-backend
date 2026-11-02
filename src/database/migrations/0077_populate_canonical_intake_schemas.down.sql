-- Migration Down: 0077_populate_canonical_intake_schemas.down.sql
DELETE FROM clinical_intake_forms WHERE code = 'standard-registration';
UPDATE clinical_intake_forms SET schema = '{"steps": []}'::jsonb WHERE code IN ('pregnancy', 'immunization', 'general');

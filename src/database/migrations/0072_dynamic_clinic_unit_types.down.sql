-- Rollback 0072: Dynamic Clinic Unit Types
CREATE TYPE clinic_unit_type AS ENUM ('department', 'polyclinic', 'ward', 'emergency', 'support', 'other');

ALTER TABLE clinic_units 
  DROP COLUMN IF EXISTS unit_type_id;

ALTER TABLE clinic_units 
  ADD COLUMN unit_type clinic_unit_type DEFAULT 'other' NOT NULL;

CREATE INDEX IF NOT EXISTS clinic_units_type_active_idx 
  ON clinic_units(unit_type, is_active);

DROP TABLE IF EXISTS clinic_unit_types CASCADE;

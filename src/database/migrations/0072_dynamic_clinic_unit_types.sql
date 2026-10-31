-- Migration 0072: Dynamic Clinic Unit Types (Administrator-Managed Master Data)

-- 1. Create master table clinic_unit_types
CREATE TABLE IF NOT EXISTS clinic_unit_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon_name VARCHAR(64) DEFAULT 'building-2' NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  CONSTRAINT clinic_unit_types_code_key UNIQUE (code),
  CONSTRAINT clinic_unit_types_code_format CHECK (code ~ '^[a-z][a-z0-9_]*$'::text),
  CONSTRAINT clinic_unit_types_name_not_blank CHECK (length(TRIM(BOTH FROM name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_clinic_unit_types_is_active 
  ON clinic_unit_types(is_active);

-- 2. Modify clinic_units: drop old index & enum column, add unit_type_id foreign key
DROP INDEX IF EXISTS clinic_units_type_active_idx;

-- Ensure clean canvas on clinic_units (currently 0 rows)
TRUNCATE TABLE clinic_units CASCADE;

ALTER TABLE clinic_units 
  DROP COLUMN IF EXISTS unit_type;

ALTER TABLE clinic_units 
  ADD COLUMN unit_type_id UUID NOT NULL REFERENCES clinic_unit_types(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_clinic_units_unit_type_id 
  ON clinic_units(unit_type_id);

-- 3. Drop legacy enum clinic_unit_type
DROP TYPE IF EXISTS clinic_unit_type;

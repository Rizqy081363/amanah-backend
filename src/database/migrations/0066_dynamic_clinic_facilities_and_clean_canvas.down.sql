-- Migration 0066 Down: Revert Dynamic Clinic Facilities & Icon-First Architecture
DROP INDEX IF EXISTS idx_service_categories_unit_id;
ALTER TABLE service_categories DROP COLUMN IF EXISTS unit_id;
ALTER TABLE clinic_units DROP COLUMN IF EXISTS icon_name;
ALTER TABLE service_categories DROP COLUMN IF EXISTS icon_name;
ALTER TABLE clinic_services ADD COLUMN IF NOT EXISTS image_url TEXT;

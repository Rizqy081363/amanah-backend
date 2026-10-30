-- Migration 0066: Dynamic Clinic Facilities, Blank Canvas & Icon-First Architecture
-- 1. Wipe old legacy seed data to a clean blank canvas
TRUNCATE TABLE clinic_services CASCADE;
TRUNCATE TABLE service_categories CASCADE;
TRUNCATE TABLE clinic_rooms CASCADE;
TRUNCATE TABLE clinic_units CASCADE;

-- 2. Drop image_url from clinic_services (transition to pure icon_name paradigm)
ALTER TABLE clinic_services DROP COLUMN IF EXISTS image_url;

-- 3. Ensure icon_name on clinic_services has default 'stethoscope'
ALTER TABLE clinic_services ALTER COLUMN icon_name SET DEFAULT 'stethoscope';

-- 4. Add icon_name to clinic_units and service_categories (pure Lucide icon keys, zero image bloat)
ALTER TABLE clinic_units 
  ADD COLUMN IF NOT EXISTS icon_name VARCHAR(64) DEFAULT 'building-2' NOT NULL;

ALTER TABLE service_categories 
  ADD COLUMN IF NOT EXISTS icon_name VARCHAR(64) DEFAULT 'folder' NOT NULL;

-- 5. Wire service_categories to clinic_units via authoritative foreign key
ALTER TABLE service_categories 
  ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES clinic_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_service_categories_unit_id 
  ON service_categories(unit_id);

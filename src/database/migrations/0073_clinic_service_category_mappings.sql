-- Migration 0073: Clinic Service Category Mappings (Many-to-Many Junction Table)

CREATE TABLE IF NOT EXISTS clinic_service_category_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES clinic_services(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES service_categories(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  CONSTRAINT uq_clinic_service_category_mapping UNIQUE (service_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_clinic_service_category_mappings_service 
  ON clinic_service_category_mappings(service_id);

CREATE INDEX IF NOT EXISTS idx_clinic_service_category_mappings_category 
  ON clinic_service_category_mappings(category_id);

-- Backfill data dari data clinic_services yang sudah ada saat ini
INSERT INTO clinic_service_category_mappings (service_id, category_id, is_primary)
SELECT id, service_category_id, true
FROM clinic_services
WHERE service_category_id IS NOT NULL
ON CONFLICT (service_id, category_id) DO NOTHING;

-- Migration 0067: Dynamic Clinical Intake Forms Registry and Service Linking
-- Decouples services from hardcoded medical_flow enum to a dynamic, scalable form registry

-- 1. Create clinical_intake_forms table (Clean canvas, unseeded)
CREATE TABLE IF NOT EXISTS clinical_intake_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(128) NOT NULL,
  description TEXT,
  icon_name VARCHAR(64) NOT NULL DEFAULT 'clipboard-list',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clinical_intake_forms_code
  ON clinical_intake_forms(code);
CREATE INDEX IF NOT EXISTS idx_clinical_intake_forms_active
  ON clinical_intake_forms(is_active);

-- 2. Add dynamic intake_form_id FK to clinic_services
ALTER TABLE clinic_services
  ADD COLUMN IF NOT EXISTS intake_form_id UUID REFERENCES clinical_intake_forms(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clinic_services_intake_form_id
  ON clinic_services(intake_form_id);

-- 3. Drop legacy medical_flow enum column from clinic_services
ALTER TABLE clinic_services
  DROP COLUMN IF EXISTS medical_flow;

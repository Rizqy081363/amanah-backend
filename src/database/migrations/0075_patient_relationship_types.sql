-- Migration 0075: Dynamic Patient Relationship Types (Administrator-Managed Master Data)

-- 1. Create master table patient_relationship_types
CREATE TABLE IF NOT EXISTS patient_relationship_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon_name VARCHAR(64) DEFAULT 'user' NOT NULL,
  display_order INTEGER DEFAULT 0 NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  is_system BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  CONSTRAINT patient_relationship_types_code_key UNIQUE (code),
  CONSTRAINT patient_relationship_types_code_format CHECK (code ~ '^[a-z][a-z0-9_]*$'::text),
  CONSTRAINT patient_relationship_types_name_not_blank CHECK (length(TRIM(BOTH FROM name)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_patient_relationship_types_is_active 
  ON patient_relationship_types(is_active);

CREATE INDEX IF NOT EXISTS idx_patient_relationship_types_display_order 
  ON patient_relationship_types(display_order);

CREATE TRIGGER set_patient_relationship_types_updated_at
  BEFORE UPDATE ON patient_relationship_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- 2. Seed initial canonical records directly into database
INSERT INTO patient_relationship_types (code, name, description, icon_name, display_order, is_active, is_system)
VALUES
  ('diri_sendiri', 'Diri Sendiri', 'Pemilik akun utama yang berobat langsung', 'user', 1, true, true),
  ('pasangan', 'Pasangan', 'Suami atau istri sah dari pemilik akun', 'heart', 2, true, false),
  ('anak', 'Anak', 'Anak kandung atau anak asuh', 'baby', 3, true, false),
  ('orang_tua', 'Orang Tua', 'Ayah atau ibu kandung atau mertua', 'users', 4, true, false),
  ('kerabat', 'Kerabat', 'Anggota keluarga besar atau kerabat', 'user-check', 5, true, false),
  ('teman', 'Teman', 'Teman atau rekan kerja yang didaftarkan', 'smile', 6, true, false),
  ('lainnya', 'Lainnya', 'Hubungan lainnya atau wali pendamping', 'help-circle', 7, true, false)
ON CONFLICT (code) DO NOTHING;

-- 3. Modify patient_affiliations to use relational Foreign Key (link ID)
-- Ensure clean canvas on patient_affiliations (currently 0 rows in live database)
TRUNCATE TABLE patient_affiliations CASCADE;

ALTER TABLE patient_affiliations 
  DROP COLUMN IF EXISTS relationship_type;

ALTER TABLE patient_affiliations 
  ADD COLUMN relationship_type_id UUID NOT NULL REFERENCES patient_relationship_types(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_patient_affiliations_relationship_type_id 
  ON patient_affiliations(relationship_type_id);

-- 4. Drop legacy PostgreSQL enum
DROP TYPE IF EXISTS patient_relationship_type;

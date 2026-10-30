-- Migration 0063: Add audience to roles (internal vs external)
-- Distinguishes internal clinic roles (staff, practitioners, admins) from external audience roles (patients)

ALTER TABLE roles 
  ADD COLUMN IF NOT EXISTS audience VARCHAR(20) NOT NULL DEFAULT 'internal';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'roles_audience_check') THEN
    ALTER TABLE roles ADD CONSTRAINT roles_audience_check CHECK (audience IN ('internal', 'external'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS roles_audience_idx ON roles(audience);

-- Ensure default superadmin role is internal
UPDATE roles SET audience = 'internal' WHERE code = 'admin';

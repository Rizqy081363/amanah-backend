-- Migration 0065: Universal Notification Target Role and Canonical Audience Scopes
-- Introduces target_role_id FK to roles(id) and canonical audience enum ('all', 'internal', 'external')

-- 1. Add target_role_id referencing roles(id)
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS target_role_id UUID REFERENCES roles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_target_role 
  ON notifications(target_role_id) 
  WHERE target_role_id IS NOT NULL;

-- 2. Normalize existing audience values to canonical representations
UPDATE notifications 
SET audience = 'internal' 
WHERE audience = 'clinic';

UPDATE notifications 
SET audience = 'external' 
WHERE audience = 'patient';

-- Fallback for any unknown / NULL audience to 'internal'
UPDATE notifications 
SET audience = 'internal' 
WHERE audience IS NULL OR audience NOT IN ('all', 'internal', 'external');

-- 3. Set default to 'internal' and alter column type to varchar(20)
ALTER TABLE notifications 
  ALTER COLUMN audience SET DEFAULT 'internal',
  ALTER COLUMN audience SET NOT NULL;

-- 4. Add check constraint for canonical target scopes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notifications_audience_check') THEN
    ALTER TABLE notifications 
      ADD CONSTRAINT notifications_audience_check 
      CHECK (audience IN ('all', 'internal', 'external'));
  END IF;
END $$;

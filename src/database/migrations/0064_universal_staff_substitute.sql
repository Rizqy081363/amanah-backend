-- Migration 0064: Universal Staff Substitute for Leave Requests
-- Replaces practitioner-only substitutes with universal staff profile substitutes

-- 1. Add substitute_staff_profile_id to staff_leave_requests
ALTER TABLE staff_leave_requests
  ADD COLUMN IF NOT EXISTS substitute_staff_profile_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL;

-- 2. Backfill substitute_staff_profile_id from practitioners if substitute_practitioner_id exists
UPDATE staff_leave_requests slr
SET substitute_staff_profile_id = p.staff_profile_id
FROM practitioners p
WHERE slr.substitute_practitioner_id = p.id
  AND slr.substitute_staff_profile_id IS NULL;

-- 3. Create index for fast substitute lookup
CREATE INDEX IF NOT EXISTS staff_leave_requests_substitute_staff_idx 
  ON staff_leave_requests(substitute_staff_profile_id);

-- 4. Add consistency constraint: substitute cannot be the same staff member
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_leave_requests_substitute_staff_not_self') THEN
    ALTER TABLE staff_leave_requests 
      ADD CONSTRAINT staff_leave_requests_substitute_staff_not_self 
      CHECK (substitute_staff_profile_id IS NULL OR substitute_staff_profile_id <> staff_profile_id);
  END IF;
END $$;

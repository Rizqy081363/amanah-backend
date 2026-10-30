-- Migration 0064 Down: Rollback Universal Staff Substitute
ALTER TABLE staff_leave_requests 
  DROP CONSTRAINT IF EXISTS staff_leave_requests_substitute_staff_not_self;

DROP INDEX IF EXISTS staff_leave_requests_substitute_staff_idx;

ALTER TABLE staff_leave_requests 
  DROP COLUMN IF EXISTS substitute_staff_profile_id;

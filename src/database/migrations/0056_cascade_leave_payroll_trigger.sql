-- Migration 0056: Create cascade trigger for staff_leave_requests -> payroll_entries
-- When a staff leave request is deleted, any payroll entry referencing it (source_type = 'leave_request')
-- must be automatically deleted to prevent orphaned deduction records.

CREATE OR REPLACE FUNCTION public.trg_fn_cascade_leave_payroll_deletion()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM public.payroll_entries
  WHERE source_type = 'leave_request' AND source_id = OLD.id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_cascade_leave_payroll_deletion ON public.staff_leave_requests;

CREATE TRIGGER trg_cascade_leave_payroll_deletion
AFTER DELETE ON public.staff_leave_requests
FOR EACH ROW
EXECUTE FUNCTION public.trg_fn_cascade_leave_payroll_deletion();

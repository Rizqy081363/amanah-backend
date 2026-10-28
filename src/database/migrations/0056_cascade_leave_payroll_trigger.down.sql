-- Rollback Migration 0056: Drop cascade trigger for staff_leave_requests -> payroll_entries

DROP TRIGGER IF EXISTS trg_cascade_leave_payroll_deletion ON public.staff_leave_requests;
DROP FUNCTION IF EXISTS public.trg_fn_cascade_leave_payroll_deletion();

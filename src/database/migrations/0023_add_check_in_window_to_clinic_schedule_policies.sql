ALTER TABLE "clinic_schedule_policies" ADD COLUMN IF NOT EXISTS "check_in_window_hours" integer NOT NULL DEFAULT 24;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clinic_schedule_policies_check_in_window_positive'
  ) THEN
    ALTER TABLE "clinic_schedule_policies" ADD CONSTRAINT "clinic_schedule_policies_check_in_window_positive" CHECK (check_in_window_hours > 0);
  END IF;
END $$;

ALTER TABLE practitioners
ADD COLUMN IF NOT EXISTS consultation_duration_minutes integer NOT NULL DEFAULT 30,
ADD COLUMN IF NOT EXISTS start_precision_minutes integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'practitioners_consultation_duration_positive'
  ) THEN
    ALTER TABLE practitioners
    ADD CONSTRAINT practitioners_consultation_duration_positive
    CHECK (consultation_duration_minutes > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'practitioners_start_precision_positive'
  ) THEN
    ALTER TABLE practitioners
    ADD CONSTRAINT practitioners_start_precision_positive
    CHECK (start_precision_minutes > 0);
  END IF;
END $$;

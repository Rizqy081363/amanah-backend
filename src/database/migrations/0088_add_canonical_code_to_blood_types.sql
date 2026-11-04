-- Migration: 0088_add_canonical_code_to_blood_types.sql
-- 1. Adds machine-readable code column to public.blood_types
-- 2. Backfills canonical codes for all 13 blood types matching the PostgreSQL enum values
-- 3. Sets NOT NULL, UNIQUE constraint, and supporting index

ALTER TABLE public.blood_types
  ADD COLUMN IF NOT EXISTS code varchar(32);

UPDATE public.blood_types
SET code = CASE
  WHEN name = 'A+' THEN 'a_positive'
  WHEN name = 'A-' THEN 'a_negative'
  WHEN name = 'B+' THEN 'b_positive'
  WHEN name = 'B-' THEN 'b_negative'
  WHEN name = 'AB+' THEN 'ab_positive'
  WHEN name = 'AB-' THEN 'ab_negative'
  WHEN name = 'O+' THEN 'o_positive'
  WHEN name = 'O-' THEN 'o_negative'
  WHEN name = 'A' THEN 'a'
  WHEN name = 'B' THEN 'b'
  WHEN name = 'AB' THEN 'ab'
  WHEN name = 'O' THEN 'o'
  WHEN name = 'Tidak Tahu' THEN 'unknown'
  ELSE lower(replace(replace(replace(name, '+', '_positive'), '-', '_negative'), ' ', '_'))
END
WHERE code IS NULL;

ALTER TABLE public.blood_types
  ALTER COLUMN code SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'blood_types_code_unique'
  ) THEN
    ALTER TABLE public.blood_types ADD CONSTRAINT blood_types_code_unique UNIQUE (code);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS blood_types_code_idx ON public.blood_types(code);

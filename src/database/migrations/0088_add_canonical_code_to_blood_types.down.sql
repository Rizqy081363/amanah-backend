ALTER TABLE public.blood_types
  DROP CONSTRAINT IF EXISTS blood_types_code_unique,
  DROP COLUMN IF EXISTS code;
DROP INDEX IF EXISTS public.blood_types_code_idx;

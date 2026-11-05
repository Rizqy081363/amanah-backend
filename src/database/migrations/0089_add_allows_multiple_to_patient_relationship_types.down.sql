-- Down Migration: 0089_add_allows_multiple_to_patient_relationship_types.down.sql
DROP INDEX IF EXISTS public.idx_patient_affiliations_user_rel;
ALTER TABLE public.patient_relationship_types
  DROP COLUMN IF EXISTS allows_multiple;

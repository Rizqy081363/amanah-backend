-- Migration: 0089_add_allows_multiple_to_patient_relationship_types.sql
-- 1. Adds allows_multiple column to patient_relationship_types with default true
-- 2. Sets allows_multiple = false for the system default relationship (WHERE is_system = true)
-- 3. Adds supporting index on patient_affiliations (user_id, relationship_type_id)

ALTER TABLE public.patient_relationship_types
  ADD COLUMN IF NOT EXISTS allows_multiple boolean DEFAULT true NOT NULL;

UPDATE public.patient_relationship_types
SET allows_multiple = false
WHERE is_system = true;

CREATE INDEX IF NOT EXISTS idx_patient_affiliations_user_rel
  ON public.patient_affiliations(user_id, relationship_type_id);

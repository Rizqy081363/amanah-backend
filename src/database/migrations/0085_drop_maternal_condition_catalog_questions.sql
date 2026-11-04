-- Migration 0085: Drop obsolete maternal condition catalog with questions & prompts
-- Context: Form questions, prompts, labels, and UI rendering are owned 100% declaratively by frontend schema.
-- Backend strictly stores normalized clinical condition responses (intake_id, condition_code, has_condition, diagnosis_year, notes).

-- 1. In maternal_health_condition_responses, drop FK constraint and condition_id column
ALTER TABLE IF EXISTS public.maternal_health_condition_responses
  DROP CONSTRAINT IF EXISTS maternal_condition_resp_condition_id_fkey;

DROP INDEX IF EXISTS public.maternal_condition_resp_condition_idx;

ALTER TABLE IF EXISTS public.maternal_health_condition_responses
  DROP COLUMN IF EXISTS condition_id;

-- 2. Drop obsolete maternal_health_condition_catalog table containing question prompts
DROP TABLE IF EXISTS public.maternal_health_condition_catalog CASCADE;

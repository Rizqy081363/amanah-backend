-- Rollback Migration 0085: Restore maternal_health_condition_catalog
CREATE TABLE IF NOT EXISTS public.maternal_health_condition_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code varchar(64) NOT NULL UNIQUE,
  name varchar(128) NOT NULL,
  question_prompt text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS public.maternal_health_condition_responses
  ADD COLUMN IF NOT EXISTS condition_id uuid REFERENCES public.maternal_health_condition_catalog(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS maternal_condition_resp_condition_idx
  ON public.maternal_health_condition_responses(condition_id);

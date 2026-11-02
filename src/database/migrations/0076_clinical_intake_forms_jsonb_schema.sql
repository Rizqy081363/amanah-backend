-- Migration 0076: Agnostic Dynamic Form Engine JSONB Schema

ALTER TABLE clinical_intake_forms 
  ADD COLUMN IF NOT EXISTS schema JSONB NOT NULL DEFAULT '{"steps": []}'::jsonb;

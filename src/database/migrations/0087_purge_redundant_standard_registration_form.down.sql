-- Rollback: 0087_purge_redundant_standard_registration_form.down.sql
INSERT INTO public.clinical_intake_forms (
  id, name, code, description, is_active, schema, created_at, updated_at
) VALUES (
  'b21e98ef-08d4-4b68-835b-7076e88354fe',
  'Pendaftaran Pasien Reguler',
  'standard-registration',
  'Formulir pendaftaran pasien reguler',
  true,
  '{}'::jsonb,
  NOW(),
  NOW()
) ON CONFLICT (code) DO NOTHING;

-- Migration: 0087_purge_redundant_standard_registration_form.sql
-- 1. Unlink any lingering services if any referenced standard-registration
UPDATE public.clinic_services
SET intake_form_id = NULL
WHERE intake_form_id IN (
  SELECT id FROM public.clinical_intake_forms WHERE code = 'standard-registration'
);

-- 2. Delete redundant standard-registration row from clinical_intake_forms
DELETE FROM public.clinical_intake_forms
WHERE code = 'standard-registration';

-- 3. Normalize immunization schema to clean lightweight metadata
UPDATE public.clinical_intake_forms
SET
  schema = jsonb_build_object(
    'title', 'Form Pendaftaran Imunisasi Anak - Amanah Health Care',
    'version', 2,
    'description', 'Formulir rekam medis imunisasi anak (Kartu Imunisasi RM-01). Terhubung langsung ke tabel relasional child_immunization_entries.'
  ),
  updated_at = NOW()
WHERE code = 'immunization';

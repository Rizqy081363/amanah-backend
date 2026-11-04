-- Down Migration: 0086_relational_demographic_masters.down.sql

ALTER TABLE IF EXISTS public.maternal_husband_profiles
  DROP COLUMN IF EXISTS blood_type_id,
  DROP COLUMN IF EXISTS education_id,
  DROP COLUMN IF EXISTS occupation_id;

ALTER TABLE IF EXISTS public.maternal_health_intakes
  DROP COLUMN IF EXISTS mother_blood_type_id,
  DROP COLUMN IF EXISTS partner_blood_type_id,
  DROP COLUMN IF EXISTS mother_education_id,
  DROP COLUMN IF EXISTS partner_education_id,
  DROP COLUMN IF EXISTS religion_id,
  DROP COLUMN IF EXISTS mother_occupation_id,
  DROP COLUMN IF EXISTS partner_occupation_id;

ALTER TABLE IF EXISTS public.patient_profiles
  DROP COLUMN IF EXISTS blood_type_id;

DROP TABLE IF EXISTS public.blood_types CASCADE;
DROP TABLE IF EXISTS public.religions CASCADE;
DROP TABLE IF EXISTS public.education_levels CASCADE;

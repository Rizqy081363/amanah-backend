-- Migration: 0086_relational_demographic_masters.sql
-- 1. Creates master demographic tables without redundant code column: education_levels, religions, blood_types
-- 2. Seeds canonical initial data with single canonical name and display order
-- 3. Adds relational foreign keys to patient_profiles, maternal_health_intakes, maternal_husband_profiles
-- 4. Backfills existing patient and maternal records to foreign key IDs

-- ============================================================================
-- 1. Master Tables Creation (Clean Single Name SSOT)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.education_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(128) NOT NULL,
  description text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT education_levels_name_unique UNIQUE (name)
);
CREATE INDEX IF NOT EXISTS education_levels_order_idx ON public.education_levels(display_order, name);

CREATE TABLE IF NOT EXISTS public.religions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(128) NOT NULL,
  description text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT religions_name_unique UNIQUE (name)
);
CREATE INDEX IF NOT EXISTS religions_order_idx ON public.religions(display_order, name);

CREATE TABLE IF NOT EXISTS public.blood_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(32) NOT NULL,
  description text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT blood_types_name_unique UNIQUE (name)
);
CREATE INDEX IF NOT EXISTS blood_types_order_idx ON public.blood_types(display_order, name);

-- ============================================================================
-- 2. Initial Seeding (Single Official Name)
-- ============================================================================

INSERT INTO public.education_levels (name, description, display_order, is_active, is_system)
VALUES
  ('Tidak sekolah', 'Belum atau tidak pernah menempuh pendidikan formal', 1, true, true),
  ('SD', 'Sekolah Dasar / MI / Sederajat', 2, true, true),
  ('SMP', 'Sekolah Menengah Pertama / MTs / Sederajat', 3, true, true),
  ('SMA/SMK', 'Sekolah Menengah Atas / Kejuruan / MA / Sederajat', 4, true, true),
  ('D1-D3', 'Diploma 1 hingga Diploma 3 / Akademi', 5, true, true),
  ('S1', 'Sarjana Strata 1 / D4', 6, true, true),
  ('S2/S3', 'Magister / Spesialis / Doktoral', 7, true, true)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  display_order = EXCLUDED.display_order;

INSERT INTO public.religions (name, description, display_order, is_active, is_system)
VALUES
  ('Islam', 'Agama Islam', 1, true, true),
  ('Kristen', 'Agama Kristen Protestan', 2, true, true),
  ('Katolik', 'Agama Kristen Katolik', 3, true, true),
  ('Hindu', 'Agama Hindu', 4, true, true),
  ('Buddha', 'Agama Buddha', 5, true, true),
  ('Konghucu', 'Agama Konghucu', 6, true, true),
  ('Lainnya', 'Kepercayaan terhadap Tuhan YME / Lainnya', 7, true, true)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  display_order = EXCLUDED.display_order;

INSERT INTO public.blood_types (name, description, display_order, is_active, is_system)
VALUES
  ('A+', 'Golongan darah A dengan Rhesus Positif', 1, true, true),
  ('A-', 'Golongan darah A dengan Rhesus Negatif', 2, true, true),
  ('B+', 'Golongan darah B dengan Rhesus Positif', 3, true, true),
  ('B-', 'Golongan darah B dengan Rhesus Negatif', 4, true, true),
  ('AB+', 'Golongan darah AB dengan Rhesus Positif', 5, true, true),
  ('AB-', 'Golongan darah AB dengan Rhesus Negatif', 6, true, true),
  ('O+', 'Golongan darah O dengan Rhesus Positif', 7, true, true),
  ('O-', 'Golongan darah O dengan Rhesus Negatif', 8, true, true),
  ('A', 'Golongan darah A (Rhesus belum diketahui)', 9, true, true),
  ('B', 'Golongan darah B (Rhesus belum diketahui)', 10, true, true),
  ('AB', 'Golongan darah AB (Rhesus belum diketahui)', 11, true, true),
  ('O', 'Golongan darah O (Rhesus belum diketahui)', 12, true, true),
  ('Tidak Tahu', 'Golongan darah belum pernah diperiksa/tidak diketahui', 13, true, true)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  display_order = EXCLUDED.display_order;

-- ============================================================================
-- 3. Relational Foreign Keys & Indexes
-- ============================================================================

-- A. patient_profiles -> blood_types
ALTER TABLE public.patient_profiles
  ADD COLUMN IF NOT EXISTS blood_type_id uuid REFERENCES public.blood_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS patient_profiles_blood_type_idx ON public.patient_profiles(blood_type_id);

-- B. maternal_health_intakes relational foreign keys
ALTER TABLE public.maternal_health_intakes
  ADD COLUMN IF NOT EXISTS mother_blood_type_id uuid REFERENCES public.blood_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS partner_blood_type_id uuid REFERENCES public.blood_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mother_education_id uuid REFERENCES public.education_levels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS partner_education_id uuid REFERENCES public.education_levels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS religion_id uuid REFERENCES public.religions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS mother_occupation_id uuid REFERENCES public.occupations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS partner_occupation_id uuid REFERENCES public.occupations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS maternal_intakes_mother_blood_idx ON public.maternal_health_intakes(mother_blood_type_id);
CREATE INDEX IF NOT EXISTS maternal_intakes_partner_blood_idx ON public.maternal_health_intakes(partner_blood_type_id);
CREATE INDEX IF NOT EXISTS maternal_intakes_mother_edu_idx ON public.maternal_health_intakes(mother_education_id);
CREATE INDEX IF NOT EXISTS maternal_intakes_partner_edu_idx ON public.maternal_health_intakes(partner_education_id);
CREATE INDEX IF NOT EXISTS maternal_intakes_religion_idx ON public.maternal_health_intakes(religion_id);
CREATE INDEX IF NOT EXISTS maternal_intakes_mother_occ_idx ON public.maternal_health_intakes(mother_occupation_id);
CREATE INDEX IF NOT EXISTS maternal_intakes_partner_occ_idx ON public.maternal_health_intakes(partner_occupation_id);

-- C. maternal_husband_profiles relational foreign keys
ALTER TABLE public.maternal_husband_profiles
  ADD COLUMN IF NOT EXISTS blood_type_id uuid REFERENCES public.blood_types(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS education_id uuid REFERENCES public.education_levels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS occupation_id uuid REFERENCES public.occupations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS maternal_husband_blood_idx ON public.maternal_husband_profiles(blood_type_id);
CREATE INDEX IF NOT EXISTS maternal_husband_edu_idx ON public.maternal_husband_profiles(education_id);
CREATE INDEX IF NOT EXISTS maternal_husband_occ_idx ON public.maternal_husband_profiles(occupation_id);

-- ============================================================================
-- 4. Backfill Existing Data
-- ============================================================================

-- Backfill patient_profiles blood_type_id from enum
UPDATE public.patient_profiles p
SET blood_type_id = b.id
FROM public.blood_types b
WHERE (
  (p.blood_type::text = 'a_positive' AND b.name = 'A+') OR
  (p.blood_type::text = 'a_negative' AND b.name = 'A-') OR
  (p.blood_type::text = 'b_positive' AND b.name = 'B+') OR
  (p.blood_type::text = 'b_negative' AND b.name = 'B-') OR
  (p.blood_type::text = 'ab_positive' AND b.name = 'AB+') OR
  (p.blood_type::text = 'ab_negative' AND b.name = 'AB-') OR
  (p.blood_type::text = 'o_positive' AND b.name = 'O+') OR
  (p.blood_type::text = 'o_negative' AND b.name = 'O-') OR
  (p.blood_type::text = 'a' AND b.name = 'A') OR
  (p.blood_type::text = 'b' AND b.name = 'B') OR
  (p.blood_type::text = 'ab' AND b.name = 'AB') OR
  (p.blood_type::text = 'o' AND b.name = 'O') OR
  (p.blood_type::text = 'unknown' AND b.name = 'Tidak Tahu')
) AND p.blood_type_id IS NULL;

-- Backfill maternal_health_intakes relations
UPDATE public.maternal_health_intakes m
SET mother_education_id = e.id
FROM public.education_levels e
WHERE m.mother_education = e.name AND m.mother_education_id IS NULL;

UPDATE public.maternal_health_intakes m
SET partner_education_id = e.id
FROM public.education_levels e
WHERE m.partner_education = e.name AND m.partner_education_id IS NULL;

UPDATE public.maternal_health_intakes m
SET religion_id = r.id
FROM public.religions r
WHERE m.religion = r.name AND m.religion_id IS NULL;

UPDATE public.maternal_health_intakes m
SET mother_occupation_id = o.id
FROM public.occupations o
WHERE m.mother_job = o.name AND m.mother_occupation_id IS NULL;

UPDATE public.maternal_health_intakes m
SET partner_occupation_id = o.id
FROM public.occupations o
WHERE m.partner_job = o.name AND m.partner_occupation_id IS NULL;

-- Backfill maternal_husband_profiles relations
UPDATE public.maternal_husband_profiles h
SET education_id = e.id
FROM public.education_levels e
WHERE h.education = e.name AND h.education_id IS NULL;

UPDATE public.maternal_husband_profiles h
SET occupation_id = o.id
FROM public.occupations o
WHERE h.job = o.name AND h.occupation_id IS NULL;

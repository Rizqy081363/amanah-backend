-- Migration: 0088_drop_patient_profiles_blood_type_enum_column.sql
-- Description: Drop redundant legacy enum column blood_type from patient_profiles to enforce blood_type_id referencing master table blood_types as Single Source of Truth (SSOT).

-- 1. Ensure any remaining records with blood_type_id IS NULL are backfilled
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'patient_profiles' AND column_name = 'blood_type'
  ) THEN
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
  END IF;
END $$;

-- 2. Drop the redundant blood_type enum column
ALTER TABLE public.patient_profiles DROP COLUMN IF EXISTS blood_type;

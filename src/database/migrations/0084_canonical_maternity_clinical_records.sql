-- Migration: 0084_canonical_maternity_clinical_records.sql
-- 1. Migrates JSONB disease_history from maternal_health_intakes into relational maternal_health_condition_responses table.
-- 2. Makes intake_submission_id nullable to eliminate hard coupling to loose JSONB medical_intake_submissions.
-- 3. Drops obsolete disease_history JSONB column from maternal_health_intakes.
-- 4. Drops legacy dynamic builder tables (maternal_anamnesis_responses, maternal_question_options, maternal_screening_questions).
-- 5. Adds indexes for fast multi-pregnancy querying per patient (patient_id, created_at DESC).
-- 6. Updates clinical_intake_forms where code = 'pregnancy' to lightweight metadata.

-- Step 1: Ensure unique constraint on (maternal_intake_id, condition_code) in maternal_health_condition_responses
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'maternal_cond_resp_intake_code_uniq'
  ) THEN
    ALTER TABLE maternal_health_condition_responses
      ADD CONSTRAINT maternal_cond_resp_intake_code_uniq UNIQUE(maternal_intake_id, condition_code);
  END IF;
END $$;

-- Step 2: Make condition_id in maternal_health_condition_responses nullable so condition_code is authoritative
ALTER TABLE maternal_health_condition_responses
  ALTER COLUMN condition_id DROP NOT NULL;

-- Step 3: Migrate existing JSONB disease_history into relational rows
DO $$
DECLARE
  r RECORD;
  c_cat RECORD;
BEGIN
  FOR r IN SELECT id, disease_history FROM maternal_health_intakes WHERE disease_history IS NOT NULL AND disease_history != '{}'::jsonb LOOP
    -- Loop over standard 14 conditions
    FOR c_cat IN SELECT id, code FROM maternal_health_condition_catalog LOOP
      DECLARE
        has_val boolean := false;
        yr_val integer := null;
        notes_val text := null;
        raw_status text := null;
        raw_notes text := null;
      BEGIN
        IF c_cat.code = 'HYPERTENSION' THEN
          raw_status := r.disease_history->>'hasHypertensionHistory';
          raw_notes := r.disease_history->>'hypertensionHistoryNotes';
        ELSIF c_cat.code = 'HEART_DISEASE' THEN
          raw_status := r.disease_history->>'hasHeartDiseaseHistory';
          raw_notes := r.disease_history->>'heartDiseaseHistoryNotes';
        ELSIF c_cat.code = 'THYROID_DISEASE' THEN
          raw_status := r.disease_history->>'hasThyroidDiseaseHistory';
          raw_notes := r.disease_history->>'thyroidDiseaseHistoryNotes';
        ELSIF c_cat.code = 'AUTOIMMUNE' THEN
          raw_status := r.disease_history->>'hasAutoimmuneHistory';
          raw_notes := r.disease_history->>'autoimmuneHistoryNotes';
        ELSIF c_cat.code = 'DIABETES' THEN
          raw_status := r.disease_history->>'hasDiabetesHistory';
          raw_notes := r.disease_history->>'diabetesHistoryNotes';
        ELSIF c_cat.code = 'ASTHMA' THEN
          raw_status := r.disease_history->>'hasAsthmaHistory';
          raw_notes := r.disease_history->>'asthmaHistoryNotes';
        ELSIF c_cat.code = 'TUBERCULOSIS' THEN
          raw_status := r.disease_history->>'hasTuberculosisHistory';
          raw_notes := r.disease_history->>'tuberculosisHistoryNotes';
        ELSIF c_cat.code = 'HEPATITIS_B' THEN
          raw_status := r.disease_history->>'hasHepatitisBHistory';
          raw_notes := r.disease_history->>'hepatitisBHistoryNotes';
        ELSIF c_cat.code = 'HIV_SYPHILIS' THEN
          raw_status := r.disease_history->>'hasHivOrSyphilisHistory';
          raw_notes := r.disease_history->>'hivOrSyphilisHistoryNotes';
        ELSIF c_cat.code = 'MENTAL_HEALTH' THEN
          raw_status := r.disease_history->>'hasMentalHealthHistory';
          raw_notes := r.disease_history->>'mentalHealthHistoryNotes';
        ELSIF c_cat.code = 'TWIN_PREGNANCY' THEN
          raw_status := r.disease_history->>'hasTwinPregnancyHistory';
          raw_notes := r.disease_history->>'twinPregnancyHistoryNotes';
        ELSIF c_cat.code = 'CYST_MYOMA_TUMOR' THEN
          raw_status := r.disease_history->>'hasCystMyomaTumorHistory';
          raw_notes := r.disease_history->>'cystMyomaTumorHistoryNotes';
        ELSIF c_cat.code = 'SURGERY' THEN
          raw_status := r.disease_history->>'hasSurgeryHistory';
          raw_notes := r.disease_history->>'surgeryHistoryNotes';
        ELSIF c_cat.code = 'OTHER' THEN
          raw_status := r.disease_history->>'hasOtherDiseaseHistory';
          raw_notes := r.disease_history->>'otherDiseaseHistoryNotes';
        END IF;

        IF raw_status = 'Ya' OR raw_status = 'true' THEN
          has_val := true;
          IF raw_notes ~ '^[0-9]{4}$' THEN
            yr_val := raw_notes::integer;
            notes_val := null;
          ELSE
            notes_val := raw_notes;
          END IF;
        ELSE
          has_val := false;
        END IF;

        INSERT INTO maternal_health_condition_responses (
          id, maternal_intake_id, condition_id, condition_code, has_condition, diagnosis_year, notes, created_at
        ) VALUES (
          gen_random_uuid(), r.id, c_cat.id, c_cat.code, has_val, yr_val, notes_val, NOW()
        )
        ON CONFLICT (maternal_intake_id, condition_code)
        DO UPDATE SET
          has_condition = EXCLUDED.has_condition,
          diagnosis_year = EXCLUDED.diagnosis_year,
          notes = EXCLUDED.notes;
      END;
    END LOOP;
  END LOOP;
END $$;

-- Step 4: Drop disease_history column and make intake_submission_id nullable on maternal_health_intakes
ALTER TABLE maternal_health_intakes
  ALTER COLUMN intake_submission_id DROP NOT NULL,
  DROP COLUMN IF EXISTS disease_history;

-- Step 5: Drop obsolete dynamic form builder tables
DROP TABLE IF EXISTS maternal_anamnesis_responses CASCADE;
DROP TABLE IF EXISTS maternal_question_options CASCADE;
DROP TABLE IF EXISTS maternal_screening_questions CASCADE;

-- Step 6: Create index for multi-pregnancy lookup per patient
CREATE INDEX IF NOT EXISTS idx_maternal_intakes_patient_date
  ON maternal_health_intakes(patient_id, created_at DESC);

-- Step 7: Update clinical_intake_forms for pregnancy to lightweight metadata
UPDATE clinical_intake_forms
SET
  schema = jsonb_build_object(
    'title', 'Formulir Pengkajian Awal Kehamilan - Praktik Mandiri Bidan Nur Hidayatun',
    'version', 2,
    'description', 'Pemeriksaan kehamilan pertama (ANC). Mencakup identitas ibu, suami, anamnesa, skrining klinis, dan riwayat obstetri/KB.'
  ),
  updated_at = NOW()
WHERE code = 'pregnancy';

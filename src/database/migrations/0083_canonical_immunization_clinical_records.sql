-- Migration: 0083_canonical_immunization_clinical_records.sql
-- 1. Prunes rejected 21-vaccine questionnaire from clinical_intake_forms (code = 'immunization').
-- 2. Restructures child_immunization_entries into a 15-row cumulative clinical ledger.

-- Step 1: Update clinical_intake_forms for immunization to lightweight patient-only credentials
UPDATE clinical_intake_forms
SET
  schema = jsonb_build_object(
    'title', 'Form Pendaftaran Imunisasi Anak - Amanah Health Care',
    'version', 2,
    'description', 'Formulir pendaftaran imunisasi anak. Diisi oleh orang tua/wali sebelum jadwal kunjungan imunisasi.',
    'steps', jsonb_build_array(
      jsonb_build_object(
        'id', 'childIdentity',
        'title', 'Identitas Anak',
        'description', 'Data identitas dasar anak yang akan mendapatkan imunisasi.',
        'fields', jsonb_build_array(
          jsonb_build_object('id', 'childName', 'type', 'TEXT', 'title', 'Nama Lengkap Anak', 'label', 'Nama Anak', 'helpText', 'Nama lengkap anak sesuai akta kelahiran atau KIA.', 'placeholder', 'Contoh: Aisyah Putri Ramadhani', 'required', true, 'isActive', true, 'choices', '[]'::jsonb, 'disabled', false),
          jsonb_build_object('id', 'childNik', 'type', 'TEXT', 'title', 'NIK Anak', 'label', 'NIK Anak', 'helpText', '16 digit NIK anak sesuai Kartu Keluarga (KK).', 'placeholder', 'Contoh: 3404075201260002', 'required', true, 'isActive', true, 'choices', '[]'::jsonb, 'disabled', false),
          jsonb_build_object('id', 'childBirthDate', 'type', 'DATE', 'title', 'Tanggal Lahir Anak', 'label', 'Tanggal Lahir', 'helpText', 'Tanggal kelahiran anak.', 'placeholder', 'Pilih tanggal lahir', 'required', true, 'isActive', true, 'choices', '[]'::jsonb, 'disabled', false),
          jsonb_build_object('id', 'childSex', 'type', 'MULTIPLE_CHOICE', 'title', 'Jenis Kelamin', 'label', 'Jenis Kelamin', 'helpText', 'Pilih jenis kelamin anak.', 'placeholder', '', 'required', true, 'isActive', true, 'choices', jsonb_build_array('Laki-laki', 'Perempuan'), 'disabled', false)
        )
      ),
      jsonb_build_object(
        'id', 'parentIdentity',
        'title', 'Orang Tua & Alamat',
        'description', 'Informasi identitas orang tua/wali dan kontak domisili.',
        'fields', jsonb_build_array(
          jsonb_build_object('id', 'fatherName', 'type', 'TEXT', 'title', 'Nama Ayah', 'label', 'Nama Ayah', 'helpText', 'Nama lengkap ayah kandung/wali.', 'placeholder', 'Contoh: Ahmad Fauzi', 'required', false, 'isActive', true, 'choices', '[]'::jsonb, 'disabled', false),
          jsonb_build_object('id', 'motherName', 'type', 'TEXT', 'title', 'Nama Ibu', 'label', 'Nama Ibu', 'helpText', 'Nama lengkap ibu kandung.', 'placeholder', 'Contoh: Dewi Lestari', 'required', true, 'isActive', true, 'choices', '[]'::jsonb, 'disabled', false),
          jsonb_build_object('id', 'parentPhone', 'type', 'TEXT', 'title', 'Nomor WhatsApp / HP', 'label', 'Nomor HP', 'helpText', 'Nomor aktif untuk konfirmasi jadwal dan informasi pasca-imunisasi.', 'placeholder', 'Contoh: 081234567890', 'required', true, 'isActive', true, 'choices', '[]'::jsonb, 'disabled', false),
          jsonb_build_object('id', 'childAddress', 'type', 'PARAGRAPH', 'title', 'Alamat Lengkap', 'label', 'Alamat', 'helpText', 'Alamat domisili saat ini.', 'placeholder', 'Contoh: Jl. Anyelir I No. 243, Condongcatur, Sleman', 'required', false, 'isActive', true, 'choices', '[]'::jsonb, 'disabled', false)
        )
      ),
      jsonb_build_object(
        'id', 'medicalHistory',
        'title', 'Riwayat Vaksin & Alergi',
        'description', 'Catatan riwayat vaksinasi sebelumnya dan kondisi alergi si kecil.',
        'fields', jsonb_build_array(
          jsonb_build_object('id', 'previousVaccineHistory', 'type', 'PARAGRAPH', 'title', 'Riwayat Vaksin Sebelumnya', 'label', 'Riwayat Vaksin Sebelumnya', 'helpText', 'Tuliskan secara ringkas riwayat vaksin yang sudah didapat (misal: HB 0 sudah di RS bersalin), atau kosongkan jika belum pernah.', 'placeholder', 'Contoh: HB 0 sudah diberikan setelah lahir di RS...', 'required', false, 'isActive', true, 'choices', '[]'::jsonb, 'disabled', false),
          jsonb_build_object('id', 'childAllergyHistory', 'type', 'PARAGRAPH', 'title', 'Riwayat Alergi', 'label', 'Riwayat Alergi', 'helpText', 'Tuliskan jika anak memiliki riwayat alergi obat, makanan, atau vaksin.', 'placeholder', 'Contoh: Tidak ada alergi obat/makanan yang diketahui', 'required', false, 'isActive', true, 'choices', '[]'::jsonb, 'disabled', false)
        )
      )
    )
  ),
  updated_at = NOW()
WHERE code = 'immunization';

-- Step 2: Clean up testing entries and restructure child_immunization_entries table
TRUNCATE TABLE child_immunization_entries;

-- Drop legacy obsolete columns
ALTER TABLE child_immunization_entries
  DROP COLUMN IF EXISTS given_month,
  DROP COLUMN IF EXISTS age_estimate_months,
  DROP COLUMN IF EXISTS date_precision,
  DROP COLUMN IF EXISTS review_reasons;

-- Add canonical 1:1 clinical relational columns
ALTER TABLE child_immunization_entries
  ADD COLUMN IF NOT EXISTS row_index integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vaccine_name varchar(64) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS age_display varchar(64),
  ADD COLUMN IF NOT EXISTS fever varchar(32),
  ADD COLUMN IF NOT EXISTS cough varchar(32),
  ADD COLUMN IF NOT EXISTS runny_nose varchar(32),
  ADD COLUMN IF NOT EXISTS weight_kg numeric(5,2),
  ADD COLUMN IF NOT EXISTS height_cm numeric(5,2),
  ADD COLUMN IF NOT EXISTS head_circumference_cm numeric(5,2),
  ADD COLUMN IF NOT EXISTS temperature_celsius numeric(4,1),
  ADD COLUMN IF NOT EXISTS planning text,
  ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES appointments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS administered_by uuid REFERENCES staff_profiles(id) ON DELETE SET NULL;

-- Enforce unique cumulative milestone row per child
ALTER TABLE child_immunization_entries
  DROP CONSTRAINT IF EXISTS child_imm_entries_patient_row_uniq;
ALTER TABLE child_immunization_entries
  ADD CONSTRAINT child_imm_entries_patient_row_uniq UNIQUE(patient_id, row_index);

-- Indexing for performance and join paths
CREATE INDEX IF NOT EXISTS child_imm_entries_appt_idx ON child_immunization_entries(appointment_id);
CREATE INDEX IF NOT EXISTS child_imm_entries_row_idx ON child_immunization_entries(row_index);
CREATE INDEX IF NOT EXISTS child_imm_entries_admin_by_idx ON child_immunization_entries(administered_by);

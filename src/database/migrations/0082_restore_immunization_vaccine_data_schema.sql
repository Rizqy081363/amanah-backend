-- Migration: 0082_restore_immunization_vaccine_data_schema.sql
-- Restores the canonical vaccineHistory step in clinical_intake_forms (code = 'immunization').
-- Populates pure data fields for all 21 vaccines registered in vaccine_catalog + notes fields.
-- In accordance with pure data schema rules: zero UI presentation pollution (no component/colSpan).

UPDATE clinical_intake_forms
SET
  schema = jsonb_set(
    schema,
    '{steps}',
    (
      SELECT jsonb_build_array(
        -- 1. childIdentity
        (SELECT step FROM jsonb_array_elements(schema->'steps') step WHERE step->>'id' = 'childIdentity'),
        -- 2. parentIdentity
        (SELECT step FROM jsonb_array_elements(schema->'steps') step WHERE step->>'id' = 'parentIdentity'),
        -- 3. vaccineGateway
        (SELECT step FROM jsonb_array_elements(schema->'steps') step WHERE step->>'id' = 'vaccineGateway'),
        -- 4. vaccineHistory (Pure Data Schema)
        jsonb_build_object(
          'id', 'vaccineHistory',
          'title', 'Daftar Riwayat Vaksinasi Anak',
          'description', 'Pilih status pemberian vaksin yang diingat atau sesuai catatan Buku KIA.',
          'fields', jsonb_build_array(
            jsonb_build_object('id', 'vaccine_HB_0_status', 'type', 'MULTIPLE_CHOICE', 'title', 'HB 0 (Saat Lahir)', 'label', 'HB 0', 'helpText', 'Pemberian vaksin HB 0 saat lahir', 'placeholder', '', 'required', false, 'isActive', true, 'choices', jsonb_build_array('Sudah', 'Belum', 'Tidak tahu'), 'disabled', false),
            jsonb_build_object('id', 'vaccine_HB_0_date', 'type', 'DATE', 'title', 'Tanggal suntik HB 0', 'label', 'HB 0 - tanggal', 'helpText', 'Tanggal penyuntikan vaksin HB 0', 'placeholder', 'Pilih tanggal', 'required', false, 'isActive', true, 'choices', '[]'::jsonb, 'disabled', false),

            jsonb_build_object('id', 'vaccine_BCG_status', 'type', 'MULTIPLE_CHOICE', 'title', 'BCG (1 Bulan)', 'label', 'BCG', 'helpText', 'Pemberian vaksin BCG', 'placeholder', '', 'required', false, 'isActive', true, 'choices', jsonb_build_array('Sudah', 'Belum', 'Tidak tahu'), 'disabled', false),
            jsonb_build_object('id', 'vaccine_BCG_date', 'type', 'DATE', 'title', 'Tanggal suntik BCG', 'label', 'BCG - tanggal', 'helpText', 'Tanggal penyuntikan vaksin BCG', 'placeholder', 'Pilih tanggal', 'required', false, 'isActive', true, 'choices', '[]'::jsonb, 'disabled', false),

            jsonb_build_object('id', 'vaccine_PENTA_1_status', 'type', 'MULTIPLE_CHOICE', 'title', 'Penta 1 (2 Bulan)', 'label', 'Penta 1', 'helpText', 'Pemberian vaksin Pentavalen 1', 'placeholder', '', 'required', false, 'isActive', true, 'choices', jsonb_build_array('Sudah', 'Belum', 'Tidak tahu'), 'disabled', false),
            jsonb_build_object('id', 'vaccine_PENTA_1_date', 'type', 'DATE', 'title', 'Tanggal suntik Penta 1', 'label', 'Penta 1 - tanggal', 'helpText', 'Tanggal penyuntikan vaksin Penta 1', 'placeholder', 'Pilih tanggal', 'required', false, 'isActive', true, 'choices', '[]'::jsonb, 'disabled', false),

            jsonb_build_object('id', 'vaccine_IPV_1_status', 'type', 'MULTIPLE_CHOICE', 'title', 'IPV 1 (2 Bulan)', 'label', 'IPV 1', 'helpText', 'Pemberian vaksin Polio Suntik 1', 'placeholder', '', 'required', false, 'isActive', true, 'choices', jsonb_build_array('Sudah', 'Belum', 'Tidak tahu'), 'disabled', false),
            jsonb_build_object('id', 'vaccine_IPV_1_date', 'type', 'DATE', 'title', 'Tanggal suntik IPV 1', 'label', 'IPV 1 - tanggal', 'helpText', 'Tanggal penyuntikan vaksin IPV 1', 'placeholder', 'Pilih tanggal', 'required', false, 'isActive', true, 'choices', '[]'::jsonb, 'disabled', false),

            jsonb_build_object('id', 'vaccine_HEXA_1_status', 'type', 'MULTIPLE_CHOICE', 'title', 'Heksavalen 1 (2 Bulan)', 'label', 'Heksavalen 1', 'helpText', 'Pemberian vaksin Heksavalen 1', 'placeholder', '', 'required', false, 'isActive', true, 'choices', jsonb_build_array('Sudah', 'Belum', 'Tidak tahu'), 'disabled', false),
            jsonb_build_object('id', 'vaccine_HEXA_1_date', 'type', 'DATE', 'title', 'Tanggal suntik Heksavalen 1', 'label', 'Heksavalen 1 - tanggal', 'helpText', 'Tanggal penyuntikan vaksin Heksavalen 1', 'placeholder', 'Pilih tanggal', 'required', false, 'isActive', true, 'choices', '[]'::jsonb, 'disabled', false),

            jsonb_build_object('id', 'vaccine_PCV_1_status', 'type', 'MULTIPLE_CHOICE', 'title', 'PCV 1 (2 Bulan)', 'label', 'PCV 1', 'helpText', 'Pemberian vaksin Pneumokokus 1', 'placeholder', '', 'required', false, 'isActive', true, 'choices', jsonb_build_array('Sudah', 'Belum', 'Tidak tahu'), 'disabled', false),
            jsonb_build_object('id', 'vaccine_PCV_1_date', 'type', 'DATE', 'title', 'Tanggal suntik PCV 1', 'label', 'PCV 1 - tanggal', 'helpText', 'Tanggal penyuntikan vaksin PCV 1', 'placeholder', 'Pilih tanggal', 'required', false, 'isActive', true, 'choices', '[]'::jsonb, 'disabled', false),

            jsonb_build_object('id', 'vaccine_RV_1_status', 'type', 'MULTIPLE_CHOICE', 'title', 'RV 1 (2 Bulan)', 'label', 'RV 1', 'helpText', 'Pemberian vaksin Rotavirus 1', 'placeholder', '', 'required', false, 'isActive', true, 'choices', jsonb_build_array('Sudah', 'Belum', 'Tidak tahu'), 'disabled', false),
            jsonb_build_object('id', 'vaccine_RV_1_date', 'type', 'DATE', 'title', 'Tanggal suntik RV 1', 'label', 'RV 1 - tanggal', 'helpText', 'Tanggal penyuntikan vaksin RV 1', 'placeholder', 'Pilih tanggal', 'required', false, 'isActive', true, 'choices', '[]'::jsonb, 'disabled', false),

            jsonb_build_object('id', 'vaccine_PENTA_2_status', 'type', 'MULTIPLE_CHOICE', 'title', 'Penta 2 (3 Bulan)', 'label', 'Penta 2', 'helpText', 'Pemberian vaksin Pentavalen 2', 'placeholder', '', 'required', false, 'isActive', true, 'choices', jsonb_build_array('Sudah', 'Belum', 'Tidak tahu'), 'disabled', false),
            jsonb_build_object('id', 'vaccine_PENTA_2_date', 'type', 'DATE', 'title', 'Tanggal suntik Penta 2', 'label', 'Penta 2 - tanggal', 'helpText', 'Tanggal penyuntikan vaksin Penta 2', 'placeholder', 'Pilih tanggal', 'required', false, 'isActive', true, 'choices', '[]'::jsonb, 'disabled', false),

            jsonb_build_object('id', 'vaccine_IPV_2_status', 'type', 'MULTIPLE_CHOICE', 'title', 'IPV 2 (3 Bulan)', 'label', 'IPV 2', 'helpText', 'Pemberian vaksin Polio Suntik 2', 'placeholder', '', 'required', false, 'isActive', true, 'choices', jsonb_build_array('Sudah', 'Belum', 'Tidak tahu'), 'disabled', false),
            jsonb_build_object('id', 'vaccine_IPV_2_date', 'type', 'DATE', 'title', 'Tanggal suntik IPV 2', 'label', 'IPV 2 - tanggal', 'helpText', 'Tanggal penyuntikan vaksin IPV 2', 'placeholder', 'Pilih tanggal', 'required', false, 'isActive', true, 'choices', '[]'::jsonb, 'disabled', false),

            jsonb_build_object('id', 'vaccine_HEXA_2_status', 'type', 'MULTIPLE_CHOICE', 'title', 'Heksavalen 2 (3 Bulan)', 'label', 'Heksavalen 2', 'helpText', 'Pemberian vaksin Heksavalen 2', 'placeholder', '', 'required', false, 'isActive', true, 'choices', jsonb_build_array('Sudah', 'Belum', 'Tidak tahu'), 'disabled', false),
            jsonb_build_object('id', 'vaccine_HEXA_2_date', 'type', 'DATE', 'title', 'Tanggal suntik Heksavalen 2', 'label', 'Heksavalen 2 - tanggal', 'helpText', 'Tanggal penyuntikan vaksin Heksavalen 2', 'placeholder', 'Pilih tanggal', 'required', false, 'isActive', true, 'choices', '[]'::jsonb, 'disabled', false),

            jsonb_build_object('id', 'vaccine_PCV_2_status', 'type', 'MULTIPLE_CHOICE', 'title', 'PCV 2 (3 Bulan)', 'label', 'PCV 2', 'helpText', 'Pemberian vaksin Pneumokokus 2', 'placeholder', '', 'required', false, 'isActive', true, 'choices', jsonb_build_array('Sudah', 'Belum', 'Tidak tahu'), 'disabled', false),
            jsonb_build_object('id', 'vaccine_PCV_2_date', 'type', 'DATE', 'title', 'Tanggal suntik PCV 2', 'label', 'PCV 2 - tanggal', 'helpText', 'Tanggal penyuntikan vaksin PCV 2', 'placeholder', 'Pilih tanggal', 'required', false, 'isActive', true, 'choices', '[]'::jsonb, 'disabled', false),

            jsonb_build_object('id', 'vaccine_RV_2_status', 'type', 'MULTIPLE_CHOICE', 'title', 'RV 2 (3 Bulan)', 'label', 'RV 2', 'helpText', 'Pemberian vaksin Rotavirus 2', 'placeholder', '', 'required', false, 'isActive', true, 'choices', jsonb_build_array('Sudah', 'Belum', 'Tidak tahu'), 'disabled', false),
            jsonb_build_object('id', 'vaccine_RV_2_date', 'type', 'DATE', 'title', 'Tanggal suntik RV 2', 'label', 'RV 2 - tanggal', 'helpText', 'Tanggal penyuntikan vaksin RV 2', 'placeholder', 'Pilih tanggal', 'required', false, 'isActive', true, 'choices', '[]'::jsonb, 'disabled', false),

            jsonb_build_object('id', 'vaccine_PENTA_3_status', 'type', 'MULTIPLE_CHOICE', 'title', 'Penta 3 (4 Bulan)', 'label', 'Penta 3', 'helpText', 'Pemberian vaksin Pentavalen 3', 'placeholder', '', 'required', false, 'isActive', true, 'choices', jsonb_build_array('Sudah', 'Belum', 'Tidak tahu'), 'disabled', false),
            jsonb_build_object('id', 'vaccine_PENTA_3_date', 'type', 'DATE', 'title', 'Tanggal suntik Penta 3', 'label', 'Penta 3 - tanggal', 'helpText', 'Tanggal penyuntikan vaksin Penta 3', 'placeholder', 'Pilih tanggal', 'required', false, 'isActive', true, 'choices', '[]'::jsonb, 'disabled', false),

            jsonb_build_object('id', 'vaccine_IPV_3_status', 'type', 'MULTIPLE_CHOICE', 'title', 'IPV 3 (4 Bulan)', 'label', 'IPV 3', 'helpText', 'Pemberian vaksin Polio Suntik 3', 'placeholder', '', 'required', false, 'isActive', true, 'choices', jsonb_build_array('Sudah', 'Belum', 'Tidak tahu'), 'disabled', false),
            jsonb_build_object('id', 'vaccine_IPV_3_date', 'type', 'DATE', 'title', 'Tanggal suntik IPV 3', 'label', 'IPV 3 - tanggal', 'helpText', 'Tanggal penyuntikan vaksin IPV 3', 'placeholder', 'Pilih tanggal', 'required', false, 'isActive', true, 'choices', '[]'::jsonb, 'disabled', false),

            jsonb_build_object('id', 'vaccine_HEXA_3_status', 'type', 'MULTIPLE_CHOICE', 'title', 'Heksavalen 3 (4 Bulan)', 'label', 'Heksavalen 3', 'helpText', 'Pemberian vaksin Heksavalen 3', 'placeholder', '', 'required', false, 'isActive', true, 'choices', jsonb_build_array('Sudah', 'Belum', 'Tidak tahu'), 'disabled', false),
            jsonb_build_object('id', 'vaccine_HEXA_3_date', 'type', 'DATE', 'title', 'Tanggal suntik Heksavalen 3', 'label', 'Heksavalen 3 - tanggal', 'helpText', 'Tanggal penyuntikan vaksin Heksavalen 3', 'placeholder', 'Pilih tanggal', 'required', false, 'isActive', true, 'choices', '[]'::jsonb, 'disabled', false),

            jsonb_build_object('id', 'vaccine_RV_3_status', 'type', 'MULTIPLE_CHOICE', 'title', 'RV 3 (4 Bulan)', 'label', 'RV 3', 'helpText', 'Pemberian vaksin Rotavirus 3', 'placeholder', '', 'required', false, 'isActive', true, 'choices', jsonb_build_array('Sudah', 'Belum', 'Tidak tahu'), 'disabled', false),
            jsonb_build_object('id', 'vaccine_RV_3_date', 'type', 'DATE', 'title', 'Tanggal suntik RV 3', 'label', 'RV 3 - tanggal', 'helpText', 'Tanggal penyuntikan vaksin RV 3', 'placeholder', 'Pilih tanggal', 'required', false, 'isActive', true, 'choices', '[]'::jsonb, 'disabled', false),

            jsonb_build_object('id', 'vaccine_MR_status', 'type', 'MULTIPLE_CHOICE', 'title', 'MR (9 Bulan)', 'label', 'MR', 'helpText', 'Pemberian vaksin Campak Rubela (MR)', 'placeholder', '', 'required', false, 'isActive', true, 'choices', jsonb_build_array('Sudah', 'Belum', 'Tidak tahu'), 'disabled', false),
            jsonb_build_object('id', 'vaccine_MR_date', 'type', 'DATE', 'title', 'Tanggal suntik MR', 'label', 'MR - tanggal', 'helpText', 'Tanggal penyuntikan vaksin MR', 'placeholder', 'Pilih tanggal', 'required', false, 'isActive', true, 'choices', '[]'::jsonb, 'disabled', false),

            jsonb_build_object('id', 'vaccine_JE_status', 'type', 'MULTIPLE_CHOICE', 'title', 'JE (10 Bulan)', 'label', 'JE', 'helpText', 'Pemberian vaksin Japanese Encephalitis', 'placeholder', '', 'required', false, 'isActive', true, 'choices', jsonb_build_array('Sudah', 'Belum', 'Tidak tahu'), 'disabled', false),
            jsonb_build_object('id', 'vaccine_JE_date', 'type', 'DATE', 'title', 'Tanggal suntik JE', 'label', 'JE - tanggal', 'helpText', 'Tanggal penyuntikan vaksin JE', 'placeholder', 'Pilih tanggal', 'required', false, 'isActive', true, 'choices', '[]'::jsonb, 'disabled', false),

            jsonb_build_object('id', 'vaccine_PCV_B_status', 'type', 'MULTIPLE_CHOICE', 'title', 'PCV-B (12 Bulan)', 'label', 'PCV-B', 'helpText', 'Pemberian vaksin Booster PCV', 'placeholder', '', 'required', false, 'isActive', true, 'choices', jsonb_build_array('Sudah', 'Belum', 'Tidak tahu'), 'disabled', false),
            jsonb_build_object('id', 'vaccine_PCV_B_date', 'type', 'DATE', 'title', 'Tanggal suntik PCV-B', 'label', 'PCV-B - tanggal', 'helpText', 'Tanggal penyuntikan vaksin PCV-B', 'placeholder', 'Pilih tanggal', 'required', false, 'isActive', true, 'choices', '[]'::jsonb, 'disabled', false),

            jsonb_build_object('id', 'vaccine_PENTA_B_status', 'type', 'MULTIPLE_CHOICE', 'title', 'Penta-B (18 Bulan)', 'label', 'Penta-B', 'helpText', 'Pemberian vaksin Booster DPT-HB-Hib', 'placeholder', '', 'required', false, 'isActive', true, 'choices', jsonb_build_array('Sudah', 'Belum', 'Tidak tahu'), 'disabled', false),
            jsonb_build_object('id', 'vaccine_PENTA_B_date', 'type', 'DATE', 'title', 'Tanggal suntik Penta-B', 'label', 'Penta-B - tanggal', 'helpText', 'Tanggal penyuntikan vaksin Penta-B', 'placeholder', 'Pilih tanggal', 'required', false, 'isActive', true, 'choices', '[]'::jsonb, 'disabled', false),

            jsonb_build_object('id', 'vaccine_MR_B_status', 'type', 'MULTIPLE_CHOICE', 'title', 'MR-B (18 Bulan)', 'label', 'MR-B', 'helpText', 'Pemberian vaksin Booster Campak Rubela', 'placeholder', '', 'required', false, 'isActive', true, 'choices', jsonb_build_array('Sudah', 'Belum', 'Tidak tahu'), 'disabled', false),
            jsonb_build_object('id', 'vaccine_MR_B_date', 'type', 'DATE', 'title', 'Tanggal suntik MR-B', 'label', 'MR-B - tanggal', 'helpText', 'Tanggal penyuntikan vaksin MR-B', 'placeholder', 'Pilih tanggal', 'required', false, 'isActive', true, 'choices', '[]'::jsonb, 'disabled', false),

            jsonb_build_object('id', 'otherVaccinesNote', 'type', 'PARAGRAPH', 'title', 'Imunisasi lain', 'label', 'Imunisasi lain', 'helpText', 'Tuliskan jika ada imunisasi lain seperti polio tetes, influenza, atau catatan lain.', 'placeholder', 'Contoh: Polio tetes 4 kali di Puskesmas...', 'required', false, 'isActive', true, 'choices', '[]'::jsonb, 'disabled', false),
            jsonb_build_object('id', 'previousVaccineHistory', 'type', 'PARAGRAPH', 'title', 'Ringkasan riwayat vaksinasi', 'label', 'Riwayat vaksin', 'helpText', 'Ringkasan riwayat vaksinasi anak.', 'placeholder', '', 'required', false, 'isActive', true, 'choices', '[]'::jsonb, 'disabled', false)
          )
        ),
        -- 5. allergyHistory
        (SELECT step FROM jsonb_array_elements(schema->'steps') step WHERE step->>'id' = 'allergyHistory')
      )
    )
  ),
  updated_at = NOW()
WHERE code = 'immunization';

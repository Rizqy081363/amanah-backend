-- Migration 0055: Populate clinic_services image_url
-- Description: Sets canonical static image references for all 19 clinic services

UPDATE "clinic_services" SET "image_url" = '/healthcare/assets/images/layanan-umum-tekanan-darah.webp' WHERE "code" = 'cek_tekanan_darah';
UPDATE "clinic_services" SET "image_url" = '/healthcare/assets/images/asset_imunisasi.webp' WHERE "code" = 'child_immunization';
UPDATE "clinic_services" SET "image_url" = '/healthcare/assets/images/layanan-umum-konsultasi.webp' WHERE "code" = 'doctor_consultation';
UPDATE "clinic_services" SET "image_url" = '/healthcare/assets/images/layanan-umum-pemantauan.webp' WHERE "code" = 'ecg_jantung';
UPDATE "clinic_services" SET "image_url" = '/healthcare/assets/images/layanan-umum-pemeriksaan.webp' WHERE "code" = 'general_checkup';
UPDATE "clinic_services" SET "image_url" = '/healthcare/assets/images/asset_konsul_kb.webp' WHERE "code" = 'konsultasi_reproduksi';
UPDATE "clinic_services" SET "image_url" = '/healthcare/assets/images/layanan-umum-laboratorium.webp' WHERE "code" = 'laboratorium_dasar';
UPDATE "clinic_services" SET "image_url" = '/healthcare/assets/images/ChatGPT_Image_Aug_14__2026__08_21_37_PM_1_eb18f970.webp' WHERE "code" = 'layanan_khitanan';
UPDATE "clinic_services" SET "image_url" = '/healthcare/assets/images/dokumentasi/nebulizer.webp' WHERE "code" = 'nebulizer';
UPDATE "clinic_services" SET "image_url" = '/healthcare/assets/images/asset_kb.webp' WHERE "code" = 'pelayanan_kb';
UPDATE "clinic_services" SET "image_url" = '/healthcare/assets/images/layanan-umum-kehamilan.webp' WHERE "code" = 'pemeriksaan_kehamilan_umum';
UPDATE "clinic_services" SET "image_url" = '/healthcare/assets/images/layanan-umum-keluhan.webp' WHERE "code" = 'pengobatan_keluhan_ringan';
UPDATE "clinic_services" SET "image_url" = '/healthcare/assets/images/asset-perawatannifas.webp' WHERE "code" = 'perawatan_nifas';
UPDATE "clinic_services" SET "image_url" = '/healthcare/assets/images/asset_persalinan.webp' WHERE "code" = 'persalinan_normal';
UPDATE "clinic_services" SET "image_url" = '/healthcare/assets/images/layanan-umum-kehamilan.webp' WHERE "code" = 'pregnancy_checkup';
UPDATE "clinic_services" SET "image_url" = '/healthcare/assets/images/layanan-umum-keterangan.webp' WHERE "code" = 'surat_keterangan_sehat';
UPDATE "clinic_services" SET "image_url" = '/healthcare/assets/images/asset_tumbuhkembanganak.webp' WHERE "code" = 'tumbuh_kembang_anak';
UPDATE "clinic_services" SET "image_url" = '/healthcare/assets/images/asset-index-6.webp' WHERE "code" = 'usg_umum';
UPDATE "clinic_services" SET "image_url" = '/healthcare/assets/images/asset_konsul_kb.webp' WHERE "code" = 'vaginal_toilet';

-- Migration: 0087_add_clinic_services_image_url.sql
-- Description: Adds nullable image_url to clinic_services and populates initial predefined asset paths for canonical services

ALTER TABLE "clinic_services" ADD COLUMN IF NOT EXISTS "image_url" text;

UPDATE "clinic_services" SET "image_url" = '/assets/services/layanan-umum-tekanan-darah.webp' WHERE "code" IN ('cek_tekanan_darah');
UPDATE "clinic_services" SET "image_url" = '/assets/services/asset_imunisasi.webp' WHERE "code" IN ('imunisasi_anak', 'child_immunization');
UPDATE "clinic_services" SET "image_url" = '/assets/services/layanan-umum-pemeriksaan.webp' WHERE "code" IN ('pemeriksaan_dokter_umum', 'general_checkup', 'doctor_consultation');
UPDATE "clinic_services" SET "image_url" = '/assets/services/layanan-umum-pemantauan.webp' WHERE "code" IN ('pemeriksaan_ekg', 'ecg_jantung');
UPDATE "clinic_services" SET "image_url" = '/assets/services/asset_pemeriksaankehamilan.webp' WHERE "code" IN ('pemeriksaan_kehamilan', 'pemeriksaan_kehamilan_umum', 'pregnancy_checkup');
UPDATE "clinic_services" SET "image_url" = '/assets/services/asset_tumbuhkembanganak.webp' WHERE "code" IN ('pemeriksaan_tumbuh_kembang', 'tumbuh_kembang_anak');
UPDATE "clinic_services" SET "image_url" = '/assets/services/asset_kb.webp' WHERE "code" IN ('keluarga_berencana', 'pelayanan_kb');
UPDATE "clinic_services" SET "image_url" = '/assets/services/asset-perawatannifas.webp' WHERE "code" IN ('perawatan_nifas');
UPDATE "clinic_services" SET "image_url" = '/assets/services/asset_persalinan.webp' WHERE "code" IN ('persalinan_24_jam', 'persalinan_normal');
UPDATE "clinic_services" SET "image_url" = '/assets/services/layanan-umum-keluhan.webp' WHERE "code" IN ('pengobatan_keluhan_ringan');
UPDATE "clinic_services" SET "image_url" = '/assets/services/layanan-umum-keterangan.webp' WHERE "code" IN ('surat_keterangan_sehat');
UPDATE "clinic_services" SET "image_url" = '/assets/services/dokumentasi/nebulizer.webp' WHERE "code" IN ('terapi_nebulizer', 'nebulizer');
UPDATE "clinic_services" SET "image_url" = '/assets/services/asset-index-6.webp' WHERE "code" IN ('usg_kandungan', 'usg_umum');
UPDATE "clinic_services" SET "image_url" = '/assets/services/asset_konsul_kb.webp' WHERE "code" IN ('konsultasi_reproduksi', 'vaginal_toilet');
UPDATE "clinic_services" SET "image_url" = '/assets/services/layanan-umum-laboratorium.webp' WHERE "code" IN ('laboratorium_dasar');
UPDATE "clinic_services" SET "image_url" = '/assets/services/ChatGPT_Image_Aug_14__2026__08_21_37_PM_1_eb18f970.webp' WHERE "code" IN ('layanan_khitanan');

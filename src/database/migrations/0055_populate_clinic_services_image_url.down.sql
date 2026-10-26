-- Migration 0055 (Down): Revert clinic_services image_url
UPDATE "clinic_services" SET "image_url" = NULL WHERE "code" IN (
  'cek_tekanan_darah', 'child_immunization', 'doctor_consultation', 'ecg_jantung',
  'general_checkup', 'konsultasi_reproduksi', 'laboratorium_dasar', 'layanan_khitanan',
  'nebulizer', 'pelayanan_kb', 'pemeriksaan_kehamilan_umum', 'pengobatan_keluhan_ringan',
  'perawatan_nifas', 'persalinan_normal', 'pregnancy_checkup', 'surat_keterangan_sehat',
  'tumbuh_kembang_anak', 'usg_umum', 'vaginal_toilet'
);

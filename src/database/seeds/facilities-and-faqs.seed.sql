-- Seed: 4 Facilities and 16 Support FAQs

-- 1. Seed Facilities (ON CONFLICT (slug) DO UPDATE)
INSERT INTO "clinic_facilities" ("slug", "title", "summary", "image_url", "cta_url", "display_order", "is_published", "service_id")
VALUES
  (
    'apotek',
    'Apotek',
    'Menyediakan kebutuhan obat-obatan dan resep medis Anda dengan cepat tanpa perlu pindah tempat.',
    '/healthcare/assets/images/fasilitas-apotek.webp',
    '/kontak',
    1,
    true,
    NULL
  ),
  (
    'ruang-persalinan',
    'Ruang Persalinan 24 Jam',
    'Siaga setiap saat untuk mendampingi proses melahirkan dengan aman, nyaman, dan ditangani tenaga medis profesional.',
    '/healthcare/assets/images/asset-index-8.webp',
    '/kontak',
    2,
    true,
    '60884f33-1045-46fd-b434-d7e31db8b865'
  ),
  (
    'ruang-tunggu',
    'Ruang Tunggu Nyaman',
    'Area tunggu yang bersih, sejuk, dan ramah keluarga agar Anda dan kerabat tetap merasa rileks saat berobat.',
    '/healthcare/assets/images/fasilitas-ruangtunggu.webp',
    '/kontak',
    3,
    true,
    NULL
  ),
  (
    'baby-care',
    'Baby Care Center',
    'Area khusus perawatan dan stimulasi bayi yang aman, bersih, dan nyaman bagi si kecil.',
    '/healthcare/assets/images/asset-index-1.webp',
    '/kontak',
    4,
    true,
    'c6e7eeda-a0e5-473b-bcd2-e24472727320'
  )
ON CONFLICT ("slug") DO UPDATE SET
  "title" = EXCLUDED."title",
  "summary" = EXCLUDED."summary",
  "image_url" = EXCLUDED."image_url",
  "cta_url" = EXCLUDED."cta_url",
  "display_order" = EXCLUDED."display_order",
  "is_published" = EXCLUDED."is_published",
  "service_id" = EXCLUDED."service_id",
  "updated_at" = now();

-- 2. Seed FAQs
INSERT INTO "support_faqs" ("category", "title", "solution_steps", "paths", "display_order", "is_published", "service_id", "category_id")
VALUES
  (
    'general',
    'Di mana alamat Klinik Amanah Healthcare?',
    ARRAY['Klinik Amanah HealthCare (Persalinan 24 Jam) berlokasi di Jl. Anyelir 1 No.243, Perumnas Condong Catur, Condongcatur, Kec. Depok, Kabupaten Sleman, Daerah Istimewa Yogyakarta 55281.'],
    ARRAY['/', '/tentang-kami', '/fasilitas', '/kontak'],
    1,
    true,
    NULL,
    NULL
  ),
  (
    'general',
    'Apa saja layanan utama yang tersedia di Klinik Amanah Healthcare?',
    ARRAY['Layanan utama meliputi dokter umum, pemeriksaan kesehatan dasar, EKG, pemeriksaan laboratorium, nebulizer, pemeriksaan kehamilan, USG, persalinan, perawatan nifas, imunisasi, keluarga berencana, dan konsultasi kesehatan reproduksi.'],
    ARRAY['/', '/tentang-kami', '/fasilitas', '/kontak'],
    2,
    true,
    NULL,
    NULL
  ),
  (
    'general',
    'Apakah layanan persalinan tersedia 24 jam?',
    ARRAY['Klinik Amanah HealthCare dikenal sebagai fasilitas persalinan 24 jam. Untuk memastikan kesiapan layanan dan arahan kedatangan, pasien tetap disarankan menghubungi kontak klinik sebelum datang.'],
    ARRAY['/', '/tentang-kami', '/fasilitas', '/kontak'],
    3,
    true,
    '60884f33-1045-46fd-b434-d7e31db8b865',
    '485a6568-f9c2-46b0-a601-e83a25ff2554'
  ),
  (
    'general',
    'Bagaimana cara menghubungi Klinik Amanah Healthcare?',
    ARRAY['Anda dapat menghubungi Klinik Amanah Healthcare melalui telepon di +62 813-9245-6664, email klinikamanahhealthcare@gmail.com, atau Instagram @amanahhealthcare.'],
    ARRAY['/', '/tentang-kami', '/fasilitas', '/kontak'],
    4,
    true,
    NULL,
    NULL
  ),
  (
    'general',
    'Apakah perlu membuat janji sebelum datang?',
    ARRAY['Untuk konsultasi, pemeriksaan kehamilan, USG, dan layanan yang membutuhkan jadwal tenaga medis, sebaiknya hubungi klinik terlebih dahulu agar kunjungan lebih tertata.'],
    ARRAY['/', '/tentang-kami', '/fasilitas', '/kontak'],
    5,
    true,
    NULL,
    NULL
  ),
  (
    'general',
    'Apakah layanan Klinik Amanah cocok untuk keluarga?',
    ARRAY['Ya. Klinik Amanah Healthcare melayani kebutuhan kesehatan keluarga, mulai dari keluhan umum, pemeriksaan ibu hamil, persalinan, imunisasi, sampai pemantauan tumbuh kembang anak.'],
    ARRAY['/', '/tentang-kami', '/fasilitas', '/kontak'],
    6,
    true,
    NULL,
    NULL
  ),
  (
    'beranda',
    'Apa keunggulan Klinik Amanah Healthcare?',
    ARRAY['Klinik Amanah Healthcare menekankan pelayanan yang ramah, profesional, mudah dijangkau, dan nyaman untuk kebutuhan kesehatan keluarga di area Condongcatur dan sekitarnya.'],
    ARRAY['/'],
    7,
    true,
    NULL,
    NULL
  ),
  (
    'beranda',
    'Fasilitas apa yang bisa ditemukan di Klinik Amanah?',
    ARRAY['Fasilitas yang ditampilkan meliputi ruang persalinan 24 jam, ruang tunggu nyaman, apotek, dan area baby care untuk mendukung pengalaman berobat yang lebih praktis.'],
    ARRAY['/'],
    8,
    true,
    NULL,
    NULL
  ),
  (
    'tentang-kami',
    'Apa komitmen Klinik Amanah dalam melayani pasien?',
    ARRAY['Klinik Amanah berkomitmen menghadirkan pelayanan kesehatan yang ramah, mudah dipahami, profesional, dan dekat dengan kebutuhan setiap pasien serta keluarga.'],
    ARRAY['/tentang-kami'],
    9,
    true,
    NULL,
    NULL
  ),
  (
    'tentang-kami',
    'Bagaimana pendekatan Klinik Amanah terhadap pasien?',
    ARRAY['Pendekatan layanan dibuat personal dan komunikatif. Pasien dibantu memahami keluhan, pilihan pemeriksaan, dan arahan perawatan sesuai kondisi masing-masing.'],
    ARRAY['/tentang-kami'],
    10,
    true,
    NULL,
    NULL
  ),
  (
    'fasilitas',
    'Apa saja layanan dokter umum di Klinik Amanah?',
    ARRAY['Layanan dokter umum mencakup pemeriksaan dokter, pengobatan keluhan ringan, cek tekanan darah, EKG, laboratorium, nebulizer, konsultasi kesehatan, dan surat keterangan sehat.'],
    ARRAY['/fasilitas'],
    11,
    true,
    'fe44788f-d43f-4ddb-9b60-4078dc4a16da',
    'c7218253-7d0c-488d-abee-f37d116d4a91'
  ),
  (
    'fasilitas',
    'Apa saja layanan bidan dan kesehatan ibu anak?',
    ARRAY['Layanan bidan meliputi pemeriksaan kehamilan, USG, persalinan, perawatan nifas, imunisasi, keluarga berencana, pemeriksaan tumbuh kembang, dan konsultasi kesehatan reproduksi.'],
    ARRAY['/fasilitas'],
    12,
    true,
    NULL,
    '485a6568-f9c2-46b0-a601-e83a25ff2554'
  ),
  (
    'fasilitas',
    'Apakah tersedia pemeriksaan USG?',
    ARRAY['Ya, Klinik Amanah menyediakan fasilitas USG sebagai pemeriksaan penunjang untuk membantu evaluasi kondisi medis sesuai kebutuhan pasien.'],
    ARRAY['/fasilitas'],
    13,
    true,
    '7897c5ad-1341-4345-a905-b337b71ef756',
    '485a6568-f9c2-46b0-a601-e83a25ff2554'
  ),
  (
    'fasilitas',
    'Apakah bisa membuat surat keterangan sehat?',
    ARRAY['Ya, tersedia layanan surat keterangan sehat setelah pemeriksaan dasar, sesuai kebutuhan administrasi sekolah, kerja, atau perjalanan.'],
    ARRAY['/fasilitas'],
    14,
    true,
    '0c05c0c5-f95e-4053-9d48-1659c9051018',
    'c7218253-7d0c-488d-abee-f37d116d4a91'
  ),
  (
    'kontak',
    'Bagaimana cara menanyakan jadwal layanan atau dokter?',
    ARRAY['Jadwal layanan dapat ditanyakan melalui telepon, email, atau Instagram resmi Klinik Amanah Healthcare agar tim klinik dapat memberikan informasi yang paling sesuai.'],
    ARRAY['/kontak'],
    15,
    true,
    NULL,
    NULL
  ),
  (
    'kontak',
    'Bagaimana cara mendapatkan petunjuk arah ke Klinik Amanah?',
    ARRAY['Gunakan tautan Petunjuk Arah pada footer untuk membuka Google Maps menuju Klinik Amanah HealthCare (Persalinan 24 Jam) di Jl. Anyelir 1 No.243.'],
    ARRAY['/kontak'],
    16,
    true,
    NULL,
    NULL
  )
ON CONFLICT ("id") DO NOTHING;

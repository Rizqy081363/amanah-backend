#!/usr/bin/env bun
import {
  createDbPool,
  getRedisClient,
  invalidateRedisTagsAndPrefixes,
} from './purge/db-connection';

async function main() {
  console.log('🌱 [Promotions Seeder] Memulai inisialisasi seeding promo...');
  const pool = createDbPool();

  try {
    // 1. Resolve Admin User ID
    const userRes = await pool.query(
      "SELECT id FROM users WHERE email = 'admin@amanah.com' LIMIT 1;",
    );
    const adminUserId = userRes.rows[0]?.id || null;

    // 2. Resolve Service IDs
    const servicesRes = await pool.query(
      "SELECT id, code FROM clinic_services WHERE code IN ('pemeriksaan_dokter_umum', 'usg_kandungan', 'persalinan_24_jam');",
    );
    const serviceMap = new Map<string, string>();
    for (const row of servicesRes.rows) {
      serviceMap.set(row.code, row.id);
    }

    const dokterUmumId = serviceMap.get('pemeriksaan_dokter_umum') || null;
    const usgKandunganId = serviceMap.get('usg_kandungan') || null;
    const persalinanId = serviceMap.get('persalinan_24_jam') || null;

    console.log(`   [✓] Service ID Mapping:
       - pemeriksaan_dokter_umum: ${dokterUmumId}
       - usg_kandungan: ${usgKandunganId}
       - persalinan_24_jam: ${persalinanId}`);

    // 3. Clear existing seed promos with matching titles
    await pool.query(
      `DELETE FROM promotions WHERE title IN (
        'Konsultasi Dokter Umum & Cek Kesehatan',
        'Paket USG Kandungan 2D & 4D Bersama Bidan',
        'Layanan Persalinan 24 Jam Ramah Ibu dan Anak'
      );`,
    );

    // 4. Insert Initial Clean Relational Promotions
    const seedPromos = [
      {
        service_id: dokterUmumId,
        title: 'Konsultasi Dokter Umum & Cek Kesehatan',
        summary:
          'Pemeriksaan kesehatan menyeluruh bersama dokter umum berpengalaman setiap Senin - Sabtu.',
        body: 'Dapatkan pemeriksaan kesehatan menyeluruh mencakup anamnesis klinis, cek fisik komprehensif, dan rujukan pengobatan tepat sasaran di Poliklinik Umum Amanah Healthcare.',
        terms:
          'Berlaku untuk pasien umum dan BPJS. Pendaftaran dapat dilakukan secara langsung atau reservasi online.',
        image_type: 'static',
        image_value: '/promo/pemeriksaan-dokter-umum.webp',
        image_alt: 'Dokter umum memeriksa pasien di ruang konsultasi',
        cta_label: 'Jadwalkan Janji Temu',
        cta_url: '/klinik/janji-temu',
        show_banner: true,
        show_modal: false,
        show_section: true,
        modal_frequency: 'once_per_day',
        modal_delay_sec: 3,
        priority: 10,
        is_published: true,
        broadcast_to_users: true,
        broadcast_channels: ['in_app', 'push'],
      },
      {
        service_id: usgKandunganId,
        title: 'Paket USG Kandungan 2D & 4D Bersama Bidan',
        summary:
          'Pantau tumbuh kembang janin secara optimal dengan USG resolusi tinggi dan konsultasi ramah keluarga.',
        body: 'Layanan USG kehamilan dilengkapi fasilitas monitor jernih, dokumentasi cetak hasil pemeriksaan, serta penjelasan mendalam terkait kesehatan ibu dan janin dari tim bidan tersertifikasi.',
        terms:
          'Khusus ibu hamil trimester 1, 2, dan 3. Dianjurkan melakukan reservasi jadwal terlebih dahulu.',
        image_type: 'static',
        image_value: '/promo/usg-kandungan.webp',
        image_alt: 'Pemeriksaan USG kandungan ibu hamil di Klinik Amanah',
        cta_label: 'Konsultasi WhatsApp',
        cta_url:
          'https://wa.me/6281392456664?text=Halo%20Klinik%20Amanah,%20saya%20ingin%20jadwalkan%20layanan%20USG%20Kandungan',
        show_banner: false,
        show_modal: true,
        show_section: true,
        modal_frequency: 'once_per_day',
        modal_delay_sec: 3,
        priority: 20,
        is_published: true,
        broadcast_to_users: false,
        broadcast_channels: ['in_app', 'push'],
      },
      {
        service_id: persalinanId,
        title: 'Layanan Persalinan 24 Jam Ramah Ibu dan Anak',
        summary:
          'Siaga 24 jam dengan kamar bersalin privat, persalinan minim trauma, dan bidan siaga penuh.',
        body: 'Klinik Pratama Amanah Healthcare menghadirkan ruang persalinan privat, nyaman, serta berorientasi pada persalinan ramah trauma (gentle birth) didukung fasilitas resusitasi dan observasi pasca-salin terpadu.',
        terms: 'Siaga 24 jam setiap hari termasuk hari libur nasional.',
        image_type: 'static',
        image_value: '/promo/persalinan-24-jam.webp',
        image_alt:
          'Fasilitas ruang persalinan nyaman dan bersih Klinik Amanah',
        cta_label: 'Pelajari Selengkapnya',
        cta_url: '/layanan',
        show_banner: true,
        show_modal: false,
        show_section: true,
        modal_frequency: 'once_per_day',
        modal_delay_sec: 3,
        priority: 5,
        is_published: true,
        broadcast_to_users: false,
        broadcast_channels: ['in_app', 'push'],
      },
    ];

    for (const p of seedPromos) {
      await pool.query(
        `INSERT INTO promotions (
          service_id, title, summary, body, terms,
          image_type, image_value, image_alt,
          cta_label, cta_url,
          show_banner, show_modal, show_section,
          modal_frequency, modal_delay_sec,
          priority, is_published,
          broadcast_to_users, broadcast_channels,
          created_by, updated_by
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8,
          $9, $10,
          $11, $12, $13,
          $14, $15,
          $16, $17,
          $18, $19,
          $20, $20
        );`,
        [
          p.service_id,
          p.title,
          p.summary,
          p.body,
          p.terms,
          p.image_type,
          p.image_value,
          p.image_alt,
          p.cta_label,
          p.cta_url,
          p.show_banner,
          p.show_modal,
          p.show_section,
          p.modal_frequency,
          p.modal_delay_sec,
          p.priority,
          p.is_published,
          p.broadcast_to_users,
          p.broadcast_channels,
          adminUserId,
        ],
      );
      console.log(`   [✓] Promo seeded: "${p.title}" (Priority: ${p.priority})`);
    }

    // 5. Invalidate caches
    const redis = getRedisClient();
    await invalidateRedisTagsAndPrefixes(
      redis,
      ['promotions', 'clinics', 'catalog'],
      ['promo:', 'promotions:'],
    );
    await redis.quit();

    console.log('✅ [Promotions Seeder] Selesai seeding 3 promo relasional!');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('❌ [Promotions Seeder Error]:', err);
  process.exit(1);
});

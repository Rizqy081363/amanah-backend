#!/usr/bin/env bun
import {
  createDbPool,
  getRedisClient,
  invalidateRedisTagsAndPrefixes,
} from './purge/db-connection';

interface SeedUnitType {
  code: string;
  name: string;
  description: string;
  iconName: string;
}

interface SeedUnit {
  code: string;
  name: string;
  unitTypeCode: string;
  queuePrefix: string;
  iconName: string;
  location: string;
  floor: string;
}

interface SeedRoom {
  code: string;
  name: string;
  unitCode: string;
  location: string;
  floor: string;
}

interface SeedIntakeForm {
  code: string;
  name: string;
  description: string;
  iconName: string;
}

interface SeedCategory {
  code: string;
  name: string;
  unitCode: string;
  codePrefix: string;
  iconName: string;
  description: string;
  displayOrder: number;
}

interface SeedService {
  code: string;
  name: string;
  shortName: string;
  categoryCode: string;
  intakeFormCode?: string | null;
  specialtyCode?: string | null;
  codePrefix: string;
  iconName: string;
  description: string;
  displayOrder: number;
  complaints: string[];
}

// 1. MASTER UNIT TYPE
const UNIT_TYPES: SeedUnitType[] = [
  {
    code: 'rawat_jalan',
    name: 'Poliklinik Rawat Jalan',
    description:
      'Unit pelayanan rawat jalan terpadu untuk konsultasi, diagnosa, dan tindakan medis keluarga.',
    iconName: 'building-2',
  },
];

// 2. CLINIC UNITS (Only 2 Poliklinik: Umum & KIA)
const UNITS: SeedUnit[] = [
  {
    code: 'poli_umum',
    name: 'Poli Umum',
    unitTypeCode: 'rawat_jalan',
    queuePrefix: 'PU',
    iconName: 'stethoscope',
    location: 'Gedung Utama Sayap Barat',
    floor: '1',
  },
  {
    code: 'poli_kia',
    name: 'Poli KIA & Kebidanan',
    unitTypeCode: 'rawat_jalan',
    queuePrefix: 'KIA',
    iconName: 'baby',
    location: 'Gedung Utama Sayap Timur',
    floor: '1',
  },
];

// 3. CLINIC ROOMS (4 Ruangan Periksa)
const ROOMS: SeedRoom[] = [
  {
    code: 'r_pu_01',
    name: 'Ruang Periksa Umum 1',
    unitCode: 'poli_umum',
    location: 'Gedung Utama Sayap Barat',
    floor: '1',
  },
  {
    code: 'r_pu_02',
    name: 'Ruang Periksa Umum 2',
    unitCode: 'poli_umum',
    location: 'Gedung Utama Sayap Barat',
    floor: '1',
  },
  {
    code: 'r_kia_01',
    name: 'Ruang Konsultasi & ANC',
    unitCode: 'poli_kia',
    location: 'Gedung Utama Sayap Timur',
    floor: '1',
  },
  {
    code: 'r_kia_bersalin',
    name: 'Ruang Persalinan 24 Jam',
    unitCode: 'poli_kia',
    location: 'Gedung Utama Sayap Timur',
    floor: '1',
  },
];

// 4. CLINICAL INTAKE FORMS (3 Formulir Intake Medis)
const INTAKE_FORMS: SeedIntakeForm[] = [
  {
    code: 'general',
    name: 'Anamnesis Dewasa & Umum',
    description:
      'Formulir skrining keluhan klinis, riwayat penyakit keluarga, dan pemeriksaan fisik dasar.',
    iconName: 'clipboard-list',
  },
  {
    code: 'pregnancy',
    name: 'Pemeriksaan Kehamilan (ANC)',
    description:
      'Formulir pemantauan kesehatan ibu hamil, riwayat obstetri kehamilan, dan evaluasi USG.',
    iconName: 'baby',
  },
  {
    code: 'immunization',
    name: 'Pencatatan Imunisasi & Vaksin',
    description:
      'Formulir riwayat pemberian imunisasi dasar dan vaksinasi anak berkala.',
    iconName: 'syringe',
  },
];

// 5. SERVICE CATEGORIES (2 Kategori Layanan)
const CATEGORIES: SeedCategory[] = [
  {
    code: 'layanan_umum',
    name: 'Pelayanan Dokter Umum',
    unitCode: 'poli_umum',
    codePrefix: 'UM',
    iconName: 'stethoscope',
    description:
      'Pemeriksaan dan penanganan kesehatan dasar oleh dokter umum untuk menjaga kondisi tubuh tetap optimal.',
    displayOrder: 1,
  },
  {
    code: 'layanan_kia',
    name: 'Kesehatan Ibu dan Anak (Bidan)',
    unitCode: 'poli_kia',
    codePrefix: 'KIA',
    iconName: 'baby',
    description:
      'Mendukung kehamilan sehat, persalinan aman, dan tumbuh kembang buah hati yang optimal.',
    displayOrder: 2,
  },
];

// 6. CLINIC SERVICES & COMPLAINTS (13 Layanan 100% Selaras Landing Page)
const SERVICES: SeedService[] = [
  // --- Kategori Pelayanan Dokter Umum ---
  {
    code: 'pemeriksaan_dokter_umum',
    name: 'Pemeriksaan Dokter Umum',
    shortName: 'Periksa Umum',
    categoryCode: 'layanan_umum',
    intakeFormCode: 'general',
    specialtyCode: 'general_practitioner',
    codePrefix: 'UM',
    iconName: 'stethoscope',
    description:
      'Konsultasi dan pemeriksaan awal untuk mengetahui kondisi kesehatan Anda.',
    displayOrder: 1,
    complaints: [
      'Demam',
      'Batuk dan pilek',
      'Sakit kepala / pusing',
      'Nyeri ulu hati / mual',
      'Badan lemas / meriang',
    ],
  },
  {
    code: 'pengobatan_keluhan_ringan',
    name: 'Pengobatan Keluhan Ringan',
    shortName: 'Keluhan Ringan',
    categoryCode: 'layanan_umum',
    intakeFormCode: 'general',
    specialtyCode: 'general_practitioner',
    codePrefix: 'UM',
    iconName: 'stethoscope',
    description:
      'Penanganan demam, batuk, flu, sakit kepala, nyeri, dan keluhan harian lainnya.',
    displayOrder: 2,
    complaints: [
      'Flu dan hidung tersumbat',
      'Sakit radang tenggorokan',
      'Diare / buang air cair',
      'Alergi / biduran kulit',
      'Pegal linu persendian',
    ],
  },
  {
    code: 'cek_tekanan_darah',
    name: 'Cek Tekanan Darah',
    shortName: 'Tensi Darah',
    categoryCode: 'layanan_umum',
    intakeFormCode: null,
    specialtyCode: 'general_practitioner',
    codePrefix: 'UM',
    iconName: 'stethoscope',
    description:
      'Pemeriksaan tekanan darah untuk memantau risiko hipertensi.',
    displayOrder: 3,
    complaints: [
      'Kontrol tensi rutin',
      'Pusing berdenyut di pelipis',
      'Tengkuk dan leher kaku berat',
      'Riwayat keluarga hipertensi',
    ],
  },
  {
    code: 'pemeriksaan_ekg',
    name: 'Pemeriksaan EKG',
    shortName: 'EKG Jantung',
    categoryCode: 'layanan_umum',
    intakeFormCode: null,
    specialtyCode: 'general_practitioner',
    codePrefix: 'UM',
    iconName: 'heart-pulse',
    description:
      'Pemeriksaan elektrokardiografi untuk membantu mengevaluasi aktivitas dan kondisi jantung sesuai indikasi medis.',
    displayOrder: 4,
    complaints: [
      'Dada berdebar kencang',
      'Nyeri dada kiri menjalar',
      'Sesak napas saat aktivitas ringan',
      'Pemeriksaan rutin rekam jantung',
    ],
  },
  {
    code: 'terapi_nebulizer',
    name: 'Terapi Nebulizer',
    shortName: 'Nebulizer',
    categoryCode: 'layanan_umum',
    intakeFormCode: null,
    specialtyCode: 'general_practitioner',
    codePrefix: 'UM',
    iconName: 'stethoscope',
    description:
      'Fasilitas terapi nebulisasi untuk membantu penanganan pasien dengan keluhan saluran pernapasan sesuai anjuran tenaga medis.',
    displayOrder: 5,
    complaints: [
      'Sesak napas akut',
      'Asma kambuh bersin-bersin',
      'Batuk berdahak kental sulit keluar',
      'Mengi / bunyi napas grok-grok',
    ],
  },
  {
    code: 'surat_keterangan_sehat',
    name: 'Surat Keterangan Sehat',
    shortName: 'Surat Sehat',
    categoryCode: 'layanan_umum',
    intakeFormCode: null,
    specialtyCode: 'general_practitioner',
    codePrefix: 'UM',
    iconName: 'clipboard-list',
    description:
      'Pemeriksaan dasar untuk kebutuhan administrasi sekolah, kerja, atau perjalanan.',
    displayOrder: 6,
    complaints: [
      'Persyaratan melamar pekerjaan',
      'Persyaratan pendaftaran sekolah / kuliah',
      'Surat keterangan bebas buta warna',
      'Persyaratan penerbitan SIM / perjalanan',
    ],
  },

  // --- Kategori Pelayanan Kesehatan Ibu dan Anak (Bidan) ---
  {
    code: 'pemeriksaan_kehamilan',
    name: 'Pemeriksaan Kehamilan (ANC)',
    shortName: 'Pemeriksaan ANC',
    categoryCode: 'layanan_kia',
    intakeFormCode: 'pregnancy',
    specialtyCode: 'maternal_child_health',
    codePrefix: 'KIA',
    iconName: 'baby',
    description:
      'Memantau kesehatan ibu dan janin secara berkala didampingi bidan profesional.',
    displayOrder: 1,
    complaints: [
      'Pemeriksaan rutin trimester 1',
      'Pemeriksaan rutin trimester 2',
      'Pemeriksaan rutin trimester 3',
      'Mual muntah berlebihan (emesis)',
      'Nyeri perut bawah / flek',
    ],
  },
  {
    code: 'usg_kandungan',
    name: 'USG Kandungan',
    shortName: 'USG Kebidanan',
    categoryCode: 'layanan_kia',
    intakeFormCode: 'pregnancy',
    specialtyCode: 'maternal_child_health',
    codePrefix: 'KIA',
    iconName: 'baby',
    description:
      'Pemeriksaan ultrasonografi sebagai fasilitas penunjang untuk membantu evaluasi kondisi janin dan kandungan.',
    displayOrder: 2,
    complaints: [
      'Konfirmasi kantung kehamilan',
      'Evaluasi denyut jantung janin',
      'Penentuan jenis kelamin dan posisi janin',
      'Perkiraan berat badan janin dan plasenta',
    ],
  },
  {
    code: 'persalinan_24_jam',
    name: 'Persalinan 24 Jam',
    shortName: 'Persalinan',
    categoryCode: 'layanan_kia',
    intakeFormCode: null,
    specialtyCode: 'maternal_child_health',
    codePrefix: 'KIA',
    iconName: 'baby',
    description:
      'Didampingi tenaga bidan berpengalaman dan fasilitas aman 24 jam siaga.',
    displayOrder: 3,
    complaints: [
      'His / kontraksi teratur makin sering',
      'Keluar lendir campur darah',
      'Ketuban merembes / pecah',
      'Persiapan masuk ruang bersalin',
    ],
  },
  {
    code: 'perawatan_nifas',
    name: 'Perawatan Nifas & Menyusui',
    shortName: 'Nifas',
    categoryCode: 'layanan_kia',
    intakeFormCode: null,
    specialtyCode: 'maternal_child_health',
    codePrefix: 'KIA',
    iconName: 'baby',
    description:
      'Membantu pemulihan ibu setelah melahirkan dan pendampingan laktasi.',
    displayOrder: 4,
    complaints: [
      'Kontrol luka jahitan pasca salin',
      'ASI seret / payudara bengkak mengeras',
      'Perdarahan lokia nifas tidak wajar',
      'Demam nifas / rasa lemas berlebih',
    ],
  },
  {
    code: 'imunisasi_anak',
    name: 'Imunisasi Dasar & Lanjutan',
    shortName: 'Imunisasi',
    categoryCode: 'layanan_kia',
    intakeFormCode: 'immunization',
    specialtyCode: 'maternal_child_health',
    codePrefix: 'KIA',
    iconName: 'syringe',
    description:
      'Melindungi buah hati dari berbagai penyakit infeksi sesuai jadwal Kemenkes / IDAI.',
    displayOrder: 5,
    complaints: [
      'Vaksin Hepatitis B0 / Polio tetes',
      'Vaksin BCG untuk bayi baru lahir',
      'Vaksin DPT-HB-Hib kombo',
      'Vaksin Campak-Rubella (MR)',
      'Vaksin PCV dan Rotavirus',
    ],
  },
  {
    code: 'keluarga_berencana',
    name: 'Pelayanan Keluarga Berencana (KB)',
    shortName: 'Konsultasi KB',
    categoryCode: 'layanan_kia',
    intakeFormCode: null,
    specialtyCode: 'maternal_child_health',
    codePrefix: 'KIA',
    iconName: 'clipboard-list',
    description:
      'Konseling, pemasangan, dan kontrol kontrasepsi (IUD, implan, suntik, pil).',
    displayOrder: 6,
    complaints: [
      'Konsultasi rencana penjarangan kehamilan',
      'Pemasangan / pelepasan IUD tembaga',
      'Pemasangan / pelepasan implan KB',
      'Suntik KB 1 bulan / 3 bulan',
      'Pengambilan pil KB laktasi',
    ],
  },
  {
    code: 'pemeriksaan_tumbuh_kembang',
    name: 'Pemeriksaan Tumbuh Kembang Anak',
    shortName: 'Tumbuh Kembang',
    categoryCode: 'layanan_kia',
    intakeFormCode: null,
    specialtyCode: 'maternal_child_health',
    codePrefix: 'KIA',
    iconName: 'baby',
    description:
      'Memantau berat badan, tinggi badan, lingkar kepala, dan milestone perkembangan motorik anak.',
    displayOrder: 7,
    complaints: [
      'Skrining kurva pertumbuhan KMS',
      'Anak susah makan / gerakan tutup mulut (GTM)',
      'Evaluasi keterlambatan bicara (speech delay)',
      'Evaluasi keterlambatan jalan / motorik kasar',
    ],
  },
];

async function seedFacilities() {
  console.log('================================================================================');
  console.log('  AMANAH HEALTHCARE — SEED CLINIC ESSENTIALS (POLI UMUM & POLI KIA)');
  console.log('================================================================================');

  const pool = createDbPool();
  const redis = await getRedisClient();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Seed Unit Types
    console.log('[1/6] Upserting Unit Types...');
    const unitTypeMap = new Map<string, string>();
    for (const ut of UNIT_TYPES) {
      const res = await client.query(
        `
        INSERT INTO clinic_unit_types (code, name, description, icon_name, is_active, updated_at)
        VALUES ($1, $2, $3, $4, true, now())
        ON CONFLICT (code) DO UPDATE
        SET name = EXCLUDED.name,
            description = EXCLUDED.description,
            icon_name = EXCLUDED.icon_name,
            is_active = true,
            updated_at = now()
        RETURNING id, code;
        `,
        [ut.code, ut.name, ut.description, ut.iconName]
      );
      unitTypeMap.set(res.rows[0].code, res.rows[0].id);
      console.log(`      [✓] Tipe Unit: ${ut.name} (${res.rows[0].id})`);
    }

    // 2. Seed Units (Poli Umum & Poli KIA)
    console.log('\n[2/6] Upserting Clinic Units...');
    const unitMap = new Map<string, string>();
    for (const u of UNITS) {
      const unitTypeId = unitTypeMap.get(u.unitTypeCode);
      if (!unitTypeId) {
        throw new Error(`Unit type '${u.unitTypeCode}' not resolved for unit '${u.code}'`);
      }
      const res = await client.query(
        `
        INSERT INTO clinic_units (code, name, unit_type_id, queue_prefix, icon_name, location, floor, is_active, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, true, now())
        ON CONFLICT (code) DO UPDATE
        SET name = EXCLUDED.name,
            unit_type_id = EXCLUDED.unit_type_id,
            queue_prefix = EXCLUDED.queue_prefix,
            icon_name = EXCLUDED.icon_name,
            location = EXCLUDED.location,
            floor = EXCLUDED.floor,
            is_active = true,
            updated_at = now()
        RETURNING id, code;
        `,
        [u.code, u.name, unitTypeId, u.queuePrefix, u.iconName, u.location, u.floor]
      );
      unitMap.set(res.rows[0].code, res.rows[0].id);
      console.log(`      [✓] Unit: ${u.name} [${u.queuePrefix}] (${res.rows[0].id})`);
    }

    // 3. Seed Rooms
    console.log('\n[3/6] Upserting Clinic Rooms...');
    for (const r of ROOMS) {
      const unitId = unitMap.get(r.unitCode);
      if (!unitId) {
        throw new Error(`Unit '${r.unitCode}' not resolved for room '${r.code}'`);
      }
      const res = await client.query(
        `
        INSERT INTO clinic_rooms (code, name, unit_id, location, floor, is_active, updated_at)
        VALUES ($1, $2, $3, $4, $5, true, now())
        ON CONFLICT (code) DO UPDATE
        SET name = EXCLUDED.name,
            unit_id = EXCLUDED.unit_id,
            location = EXCLUDED.location,
            floor = EXCLUDED.floor,
            is_active = true,
            updated_at = now()
        RETURNING id, code;
        `,
        [r.code, r.name, unitId, r.location, r.floor]
      );
      console.log(`      [✓] Ruangan: ${r.name} (${res.rows[0].id})`);
    }

    // 4. Seed Clinical Intake Forms
    console.log('\n[4/6] Upserting Clinical Intake Forms...');
    const formMap = new Map<string, string>();
    for (const f of INTAKE_FORMS) {
      const res = await client.query(
        `
        INSERT INTO clinical_intake_forms (code, name, description, icon_name, is_active, updated_at)
        VALUES ($1, $2, $3, $4, true, now())
        ON CONFLICT (code) DO UPDATE
        SET name = EXCLUDED.name,
            description = EXCLUDED.description,
            icon_name = EXCLUDED.icon_name,
            is_active = true,
            updated_at = now()
        RETURNING id, code;
        `,
        [f.code, f.name, f.description, f.iconName]
      );
      formMap.set(res.rows[0].code, res.rows[0].id);
      console.log(`      [✓] Formulir: ${f.name} (${res.rows[0].id})`);
    }

    // 5. Seed Service Categories
    console.log('\n[5/6] Upserting Service Categories...');
    const categoryMap = new Map<string, string>();
    for (const c of CATEGORIES) {
      const unitId = unitMap.get(c.unitCode);
      const res = await client.query(
        `
        INSERT INTO service_categories (code, name, unit_id, code_prefix, icon_name, description, display_order, is_active, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, true, now())
        ON CONFLICT (code) DO UPDATE
        SET name = EXCLUDED.name,
            unit_id = EXCLUDED.unit_id,
            code_prefix = EXCLUDED.code_prefix,
            icon_name = EXCLUDED.icon_name,
            description = EXCLUDED.description,
            display_order = EXCLUDED.display_order,
            is_active = true,
            updated_at = now()
        RETURNING id, code;
        `,
        [c.code, c.name, unitId, c.codePrefix, c.iconName, c.description, c.displayOrder]
      );
      categoryMap.set(res.rows[0].code, res.rows[0].id);
      console.log(`      [✓] Kategori: ${c.name} [${c.codePrefix}] (${res.rows[0].id})`);
    }

    // Specialty lookup
    const specRes = await client.query(`SELECT id, code FROM medical_specialties;`);
    const specialtyMap = new Map<string, string>();
    for (const row of specRes.rows) {
      specialtyMap.set(row.code, row.id);
    }

    // 6. Seed Clinic Services & Complaints
    console.log('\n[6/6] Upserting Clinic Services & Complaints...');
    let totalComplaints = 0;
    for (const s of SERVICES) {
      const categoryId = categoryMap.get(s.categoryCode);
      if (!categoryId) {
        throw new Error(`Category '${s.categoryCode}' not resolved for service '${s.code}'`);
      }
      const intakeFormId = s.intakeFormCode ? formMap.get(s.intakeFormCode) || null : null;
      const specialtyId = s.specialtyCode ? specialtyMap.get(s.specialtyCode) || null : null;

      const serviceRes = await client.query(
        `
        INSERT INTO clinic_services (
          code, name, short_name, service_category_id, specialty_id, intake_form_id,
          code_prefix, icon_name, description, display_order, is_bookable, is_active, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, true, now())
        ON CONFLICT (code) DO UPDATE
        SET name = EXCLUDED.name,
            short_name = EXCLUDED.short_name,
            service_category_id = EXCLUDED.service_category_id,
            specialty_id = EXCLUDED.specialty_id,
            intake_form_id = EXCLUDED.intake_form_id,
            code_prefix = EXCLUDED.code_prefix,
            icon_name = EXCLUDED.icon_name,
            description = EXCLUDED.description,
            display_order = EXCLUDED.display_order,
            is_bookable = true,
            is_active = true,
            updated_at = now()
        RETURNING id, code;
        `,
        [
          s.code,
          s.name,
          s.shortName,
          categoryId,
          specialtyId,
          intakeFormId,
          s.codePrefix,
          s.iconName,
          s.description,
          s.displayOrder,
        ]
      );
      const serviceId = serviceRes.rows[0].id;

      // Clean & insert distinct complaints
      await client.query(`DELETE FROM clinic_service_complaints WHERE service_id = $1;`, [serviceId]);
      for (let i = 0; i < s.complaints.length; i++) {
        await client.query(
          `
          INSERT INTO clinic_service_complaints (service_id, complaint_text, display_order, updated_at)
          VALUES ($1, $2, $3, now());
          `,
          [serviceId, s.complaints[i], i + 1]
        );
        totalComplaints++;
      }

      console.log(`      [✓] Layanan: ${s.name} [${s.codePrefix}] (${s.complaints.length} keluhan)`);
    }

    await client.query('COMMIT');
    console.log('\n================================================================================');
    console.log(`[✓] TRANSACTION COMMITTED SUCCESSFULLY!`);
    console.log(`    - Unit Types        : ${UNIT_TYPES.length}`);
    console.log(`    - Clinic Units      : ${UNITS.length} (Poli Umum & Poli KIA)`);
    console.log(`    - Clinic Rooms      : ${ROOMS.length}`);
    console.log(`    - Intake Forms      : ${INTAKE_FORMS.length}`);
    console.log(`    - Categories        : ${CATEGORIES.length}`);
    console.log(`    - Clinic Services   : ${SERVICES.length}`);
    console.log(`    - Complaints Total  : ${totalComplaints}`);
    console.log('================================================================================');

    // Flush Redis Cache
    if (redis) {
      console.log('[Cache] Invalidating Redis clinics, catalog, and schedule cache tags...');
      await invalidateRedisTagsAndPrefixes(redis, ['clinics', 'catalog', 'schedule'], ['clinics']);
      console.log('[Cache] Redis cache invalidated successfully.');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n[!] SEED FAILED — Transaction rolled back:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    if (redis) redis.disconnect();
  }
}

seedFacilities().catch((err) => {
  console.error(err);
  process.exit(1);
});

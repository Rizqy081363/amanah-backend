import type { PoolClient, QueryResultRow } from 'pg';

type QueryOneInput = {
  client: PoolClient;
  text: string;
  values?: unknown[];
};

const queryOne = async <TRow extends QueryResultRow>({
  client,
  text,
  values = [],
}: QueryOneInput): Promise<TRow> => {
  const result = await client.query<TRow>(text, values);
  const row = result.rows[0];
  if (!row) {
    throw new Error(`Expected at least one row from query: ${text}`);
  }
  return row;
};

export interface MasterCatalogResult {
  categoryIdsByCode: Map<string, string>;
  serviceIdsByCode: Map<string, string>;
  occupationIdsByCode: Map<string, string>;
}

export const OCCUPATIONS_MASTER = [
  {
    code: 'pns_tni_polri',
    name: 'Pegawai Negeri Sipil / TNI / Polri',
    order: 1,
  },
  { code: 'karyawan_swasta', name: 'Karyawan Swasta', order: 2 },
  { code: 'wiraswasta', name: 'Wiraswasta / Pengusaha', order: 3 },
  { code: 'ibu_rumah_tangga', name: 'Ibu Rumah Tangga', order: 4 },
  { code: 'pelajar_mahasiswa', name: 'Pelajar / Mahasiswa', order: 5 },
  { code: 'guru_dosen', name: 'Guru / Dosen', order: 6 },
  { code: 'tenaga_medis', name: 'Tenaga Medis / Kesehatan', order: 7 },
  { code: 'petani_peternak', name: 'Petani / Peternak', order: 8 },
  { code: 'nelayan', name: 'Nelayan', order: 9 },
  { code: 'buruh', name: 'Buruh Harian Lepas', order: 10 },
  { code: 'pensiunan', name: 'Pensiunan', order: 11 },
  { code: 'belum_bekerja', name: 'Belum / Tidak Bekerja', order: 12 },
  { code: 'lainnya', name: 'Lainnya', order: 13 },
];

export const SERVICE_CATEGORIES_MASTER = [
  {
    code: 'layanan_umum',
    name: 'Layanan Umum',
    description:
      'Pelayanan medis dasar, pemeriksaan umum, dan konsultasi kesehatan.',
    order: 1,
  },
  {
    code: 'layanan_kebidanan',
    name: 'Layanan Kebidanan',
    description:
      'Pelayanan kesehatan ibu, kehamilan, persalinan, nifas, dan keluarga berencana.',
    order: 2,
  },
];

export interface ClinicServiceSeedDef {
  categoryCode: 'layanan_umum' | 'layanan_kebidanan';
  code: string;
  name: string;
  prefix: string;
  specialtyCode: 'general_practitioner' | 'maternal_child_health';
  medicalFlow: 'pregnancy' | 'immunization' | null;
  order: number;
  complaints: string[];
}

export const CLINIC_SERVICES_MASTER: ClinicServiceSeedDef[] = [
  // Layanan Umum
  {
    categoryCode: 'layanan_umum',
    code: 'usg_umum',
    name: 'USG Umum',
    prefix: 'USG',
    specialtyCode: 'general_practitioner',
    medicalFlow: null,
    order: 1,
    complaints: [
      'Pemeriksaan abdomen',
      'Nyeri perut berkala',
      'Skrining organ dalam',
    ],
  },
  {
    categoryCode: 'layanan_umum',
    code: 'general_checkup',
    name: 'Pemeriksaan Umum',
    prefix: 'UM',
    specialtyCode: 'general_practitioner',
    medicalFlow: null,
    order: 2,
    complaints: [
      'Demam dan menggigil',
      'Flu, batuk, dan pilek',
      'Sakit kepala / pusing',
      'Kelelahan berlebih',
    ],
  },
  {
    categoryCode: 'layanan_umum',
    code: 'pengobatan_keluhan_ringan',
    name: 'Pengobatan Keluhan Ringan',
    prefix: 'KR',
    specialtyCode: 'general_practitioner',
    medicalFlow: null,
    order: 3,
    complaints: [
      'Alergi kulit ringan',
      'Gatal-gatal kemerahan',
      'Luka lecet / goresan',
    ],
  },
  {
    categoryCode: 'layanan_umum',
    code: 'cek_tekanan_darah',
    name: 'Cek Tekanan Darah',
    prefix: 'TD',
    specialtyCode: 'general_practitioner',
    medicalFlow: null,
    order: 4,
    complaints: [
      'Riwayat hipertensi',
      'Pusing berputar',
      'Pemeriksaan rutin tensi darah',
    ],
  },
  {
    categoryCode: 'layanan_umum',
    code: 'ecg_jantung',
    name: 'Pemeriksaan ECG / Rekam Jantung',
    prefix: 'ECG',
    specialtyCode: 'general_practitioner',
    medicalFlow: null,
    order: 5,
    complaints: [
      'Jantung sering berdebar',
      'Nyeri dada ringan',
      'Skrining kesehatan jantung berkala',
    ],
  },
  {
    categoryCode: 'layanan_umum',
    code: 'laboratorium_dasar',
    name: 'Pemeriksaan Laboratorium Dasar',
    prefix: 'LAB',
    specialtyCode: 'general_practitioner',
    medicalFlow: null,
    order: 6,
    complaints: [
      'Cek gula darah sewaktu/puasa',
      'Cek asam urat',
      'Cek kadar kolesterol lengkap',
    ],
  },
  {
    categoryCode: 'layanan_umum',
    code: 'nebulizer',
    name: 'Nebulizer & Terapi Inhalasi',
    prefix: 'NEB',
    specialtyCode: 'general_practitioner',
    medicalFlow: null,
    order: 7,
    complaints: ['Sesak napas akut', 'Asma kambuh', 'Batuk berdahak berat'],
  },
  {
    categoryCode: 'layanan_umum',
    code: 'pemeriksaan_kehamilan_umum',
    name: 'Pemeriksaan Kehamilan Dasar',
    prefix: 'PKU',
    specialtyCode: 'general_practitioner',
    medicalFlow: 'pregnancy',
    order: 8,
    complaints: [
      'Cek tanda kehamilan',
      'Mual muntah berlebih awal kehamilan',
      'Konsultasi trimester awal',
    ],
  },
  {
    categoryCode: 'layanan_umum',
    code: 'doctor_consultation',
    name: 'Konsultasi Kesehatan',
    prefix: 'KD',
    specialtyCode: 'general_practitioner',
    medicalFlow: null,
    order: 9,
    complaints: [
      'Konsultasi pola makan & gaya hidup',
      'Evaluasi hasil lab medis',
      'Konsultasi second opinion',
    ],
  },
  {
    categoryCode: 'layanan_umum',
    code: 'surat_keterangan_sehat',
    name: 'Surat Keterangan Sehat',
    prefix: 'SKS',
    specialtyCode: 'general_practitioner',
    medicalFlow: null,
    order: 10,
    complaints: [
      'Syarat pendaftaran kerja',
      'Syarat pendaftaran sekolah / kampus',
      'Pemeriksaan fisik umum',
    ],
  },

  // Layanan Kebidanan
  {
    categoryCode: 'layanan_kebidanan',
    code: 'persalinan_normal',
    name: 'Persalinan Normal 24 Jam',
    prefix: 'SAL',
    specialtyCode: 'maternal_child_health',
    medicalFlow: 'pregnancy',
    order: 11,
    complaints: [
      'Kontraksi teratur / his',
      'Pecah ketuban dini',
      'Flek darah menjelang persalinan',
    ],
  },
  {
    categoryCode: 'layanan_kebidanan',
    code: 'pregnancy_checkup',
    name: 'Pemeriksaan Kehamilan & ANC',
    prefix: 'ANC',
    specialtyCode: 'maternal_child_health',
    medicalFlow: 'pregnancy',
    order: 12,
    complaints: [
      'Pemeriksaan kehamilan rutin ANC',
      'USG kebidanan trimester 1-3',
      'Cek denyut jantung janin & posisi',
    ],
  },
  {
    categoryCode: 'layanan_kebidanan',
    code: 'perawatan_nifas',
    name: 'Perawatan Masa Nifas (PNC)',
    prefix: 'PNC',
    specialtyCode: 'maternal_child_health',
    medicalFlow: null,
    order: 13,
    complaints: [
      'Kontrol luka perineum pasca bersalin',
      'Masalah laktasi / ASI tersumbat',
      'Evaluasi perdarahan nifas',
    ],
  },
  {
    categoryCode: 'layanan_kebidanan',
    code: 'pelayanan_kb',
    name: 'Pelayanan KB (Suntik, IUD, Implan, Pil)',
    prefix: 'KB',
    specialtyCode: 'maternal_child_health',
    medicalFlow: null,
    order: 14,
    complaints: [
      'Pemasangan / pelepasan IUD & Implan',
      'Suntik KB 1 atau 3 bulan',
      'Konsultasi pemilihan kontrasepsi',
    ],
  },
  {
    categoryCode: 'layanan_kebidanan',
    code: 'vaginal_toilet',
    name: 'Vaginal Toilet & Perawatan Intim',
    prefix: 'VT',
    specialtyCode: 'maternal_child_health',
    medicalFlow: null,
    order: 15,
    complaints: [
      'Keputihan gatal / berbau',
      'Iritasi organ intim',
      'Perawatan higienitas kewanitaan pasca bersalin',
    ],
  },
  {
    categoryCode: 'layanan_kebidanan',
    code: 'child_immunization',
    name: 'Imunisasi Dasar & Lanjutan',
    prefix: 'IM',
    specialtyCode: 'maternal_child_health',
    medicalFlow: 'immunization',
    order: 16,
    complaints: [
      'Imunisasi BCG & Polio',
      'Imunisasi DPT-HB-Hib',
      'Imunisasi Campak / MR / PCV',
    ],
  },
  {
    categoryCode: 'layanan_kebidanan',
    code: 'tumbuh_kembang_anak',
    name: 'Pemantauan Tumbuh Kembang Anak',
    prefix: 'TKA',
    specialtyCode: 'maternal_child_health',
    medicalFlow: null,
    order: 17,
    complaints: [
      'Penimbangan berat badan & tinggi',
      'Skrining perkembangan balita',
      'Konsultasi pencegahan stunting',
    ],
  },
  {
    categoryCode: 'layanan_kebidanan',
    code: 'konsultasi_reproduksi',
    name: 'Konsultasi Kesehatan Reproduksi',
    prefix: 'KKR',
    specialtyCode: 'maternal_child_health',
    medicalFlow: null,
    order: 18,
    complaints: [
      'Konsultasi persiapan pranikah',
      'Siklus menstruasi tidak teratur',
      'Program perencanaan kehamilan (promil)',
    ],
  },
  {
    categoryCode: 'layanan_kebidanan',
    code: 'layanan_khitanan',
    name: 'Layanan Khitanan (Sirkumsisi)',
    prefix: 'KHT',
    specialtyCode: 'maternal_child_health',
    medicalFlow: null,
    order: 19,
    complaints: [
      'Khitan anak / sirkumsisi dasar',
      'Khitan dewasa',
      'Kontrol dan perawatan luka pasca khitan',
    ],
  },
];

export const seedMasterCatalog = async (
  client: PoolClient,
  specialtyIdsByCode: Map<string, string>,
): Promise<MasterCatalogResult> => {
  const occupationIdsByCode = new Map<string, string>();
  for (const occ of OCCUPATIONS_MASTER) {
    const row = await queryOne<{ id: string }>({
      client,
      text: `
        INSERT INTO occupations (code, name, display_order, is_active)
        VALUES ($1, $2, $3, true)
        ON CONFLICT (code) DO UPDATE
        SET name = EXCLUDED.name,
            display_order = EXCLUDED.display_order,
            is_active = true,
            updated_at = now()
        RETURNING id
      `,
      values: [occ.code, occ.name, occ.order],
    });
    occupationIdsByCode.set(occ.code, row.id);
  }

  const categoryIdsByCode = new Map<string, string>();
  for (const cat of SERVICE_CATEGORIES_MASTER) {
    const row = await queryOne<{ id: string }>({
      client,
      text: `
        INSERT INTO service_categories (code, name, description, display_order, is_active)
        VALUES ($1, $2, $3, $4, true)
        ON CONFLICT (code) DO UPDATE
        SET name = EXCLUDED.name,
            description = EXCLUDED.description,
            display_order = EXCLUDED.display_order,
            is_active = true,
            updated_at = now()
        RETURNING id
      `,
      values: [cat.code, cat.name, cat.description, cat.order],
    });
    categoryIdsByCode.set(cat.code, row.id);
  }

  const serviceIdsByCode = new Map<string, string>();
  for (const s of CLINIC_SERVICES_MASTER) {
    const categoryId = categoryIdsByCode.get(s.categoryCode);
    const specialtyId = specialtyIdsByCode.get(s.specialtyCode);

    const row = await queryOne<{ id: string }>({
      client,
      text: `
        INSERT INTO clinic_services (
          service_category_id,
          specialty_id,
          code,
          name,
          short_name,
          code_prefix,
          medical_flow,
          display_order,
          is_bookable,
          is_active
        )
        VALUES ($1, $2, $3, $4, $4, $5, $6, $7, true, true)
        ON CONFLICT (code) DO UPDATE
        SET service_category_id = EXCLUDED.service_category_id,
            specialty_id = EXCLUDED.specialty_id,
            name = EXCLUDED.name,
            short_name = EXCLUDED.short_name,
            code_prefix = EXCLUDED.code_prefix,
            medical_flow = EXCLUDED.medical_flow,
            display_order = EXCLUDED.display_order,
            is_bookable = true,
            is_active = true,
            updated_at = now()
        RETURNING id
      `,
      values: [
        categoryId,
        specialtyId,
        s.code,
        s.name,
        s.prefix,
        s.medicalFlow,
        s.order,
      ],
    });
    serviceIdsByCode.set(s.code, row.id);

    // Seed complaints for this service
    let complaintOrder = 1;
    for (const complaint of s.complaints) {
      await client.query(
        `
          INSERT INTO clinic_service_complaints (service_id, complaint_text, display_order)
          SELECT $1, $2, $3
          WHERE NOT EXISTS (
            SELECT 1 FROM clinic_service_complaints
            WHERE service_id = $1 AND complaint_text = $2
          )
        `,
        [row.id, complaint, complaintOrder++],
      );
    }
  }

  return { categoryIdsByCode, serviceIdsByCode, occupationIdsByCode };
};

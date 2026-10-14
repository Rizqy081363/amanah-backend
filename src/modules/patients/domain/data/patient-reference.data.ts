export interface ReferenceOption {
  label: string;
  value: string;
  description?: string;
}

export const BACKEND_GENDER_OPTIONS: ReferenceOption[] = [
  { label: 'Laki-laki', value: 'Laki-laki' },
  { label: 'Perempuan', value: 'Perempuan' },
];

/**
 * 13 Pilihan Golongan Darah Sesuai Realita Enum Database PostgreSQL ('blood_type')
 * Mencakup varian rhesus lengkap, ABO netral, dan status belum diperiksa.
 */
export const BACKEND_BLOOD_TYPE_OPTIONS: ReferenceOption[] = [
  { label: 'A+', value: 'a_positive', description: 'Golongan A Rhesus Positif (+)' },
  { label: 'A-', value: 'a_negative', description: 'Golongan A Rhesus Negatif (-)' },
  { label: 'B+', value: 'b_positive', description: 'Golongan B Rhesus Positif (+)' },
  { label: 'B-', value: 'b_negative', description: 'Golongan B Rhesus Negatif (-)' },
  { label: 'AB+', value: 'ab_positive', description: 'Golongan AB Rhesus Positif (+)' },
  { label: 'AB-', value: 'ab_negative', description: 'Golongan AB Rhesus Negatif (-)' },
  { label: 'O+', value: 'o_positive', description: 'Golongan O Rhesus Positif (+)' },
  { label: 'O-', value: 'o_negative', description: 'Golongan O Rhesus Negatif (-)' },
  { label: 'A', value: 'a', description: 'Golongan A (Rhesus belum ditentukan)' },
  { label: 'B', value: 'b', description: 'Golongan B (Rhesus belum ditentukan)' },
  { label: 'AB', value: 'ab', description: 'Golongan AB (Rhesus belum ditentukan)' },
  { label: 'O', value: 'o', description: 'Golongan O (Rhesus belum ditentukan)' },
  { label: 'Belum Tahu', value: 'unknown', description: 'Belum diperiksa / Tidak tahu' },
];

export type DatabaseBloodTypeEnum =
  | 'a_positive'
  | 'a_negative'
  | 'b_positive'
  | 'b_negative'
  | 'ab_positive'
  | 'ab_negative'
  | 'o_positive'
  | 'o_negative'
  | 'a'
  | 'b'
  | 'ab'
  | 'o'
  | 'unknown';

export const VALID_BLOOD_TYPE_VALUES: readonly string[] = [
  'a_positive',
  'a_negative',
  'b_positive',
  'b_negative',
  'ab_positive',
  'ab_negative',
  'o_positive',
  'o_negative',
  'a',
  'b',
  'ab',
  'o',
  'unknown',
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
  'A',
  'B',
  'AB',
  'O',
  'Belum Tahu',
];

/**
 * Normalizer otoritatif yang memetakan input simbolik (A+, O-, Belum Tahu)
 * maupun identifier enum PostgreSQL (a_positive, unknown) ke enum database murni.
 */
export function normalizeBloodTypeToDb(input?: string | null): DatabaseBloodTypeEnum {
  if (!input) return 'unknown';
  const clean = input.trim().toLowerCase();
  switch (clean) {
    case 'a+':
    case 'a_positive':
      return 'a_positive';
    case 'a-':
    case 'a_negative':
      return 'a_negative';
    case 'b+':
    case 'b_positive':
      return 'b_positive';
    case 'b-':
    case 'b_negative':
      return 'b_negative';
    case 'ab+':
    case 'ab_positive':
      return 'ab_positive';
    case 'ab-':
    case 'ab_negative':
      return 'ab_negative';
    case 'o+':
    case 'o_positive':
      return 'o_positive';
    case 'o-':
    case 'o_negative':
      return 'o_negative';
    case 'a':
      return 'a';
    case 'b':
      return 'b';
    case 'ab':
      return 'ab';
    case 'o':
      return 'o';
    case 'belum tahu':
    case 'unknown':
      return 'unknown';
    default:
      return 'unknown';
  }
}

/**
 * Pemformat simbolis klinis dari nilai enum PostgreSQL ke representasi yang ramah pengguna.
 */
export function formatBloodTypeDisplay(raw?: string | null): string {
  if (!raw || raw === 'unknown') return 'Belum Tahu';
  switch (raw.toLowerCase()) {
    case 'a_positive':
      return 'A+';
    case 'a_negative':
      return 'A-';
    case 'b_positive':
      return 'B+';
    case 'b_negative':
      return 'B-';
    case 'ab_positive':
      return 'AB+';
    case 'ab_negative':
      return 'AB-';
    case 'o_positive':
      return 'O+';
    case 'o_negative':
      return 'O-';
    case 'a':
      return 'A';
    case 'b':
      return 'B';
    case 'ab':
      return 'AB';
    case 'o':
      return 'O';
    default:
      return raw.toUpperCase();
  }
}

export const BACKEND_RELATIONSHIP_OPTIONS: ReferenceOption[] = [
  {
    label: 'Diri Sendiri',
    value: 'self',
    description: 'Profil data pribadi akun utama',
  },
  {
    label: 'Anak Kandung',
    value: 'child',
    description: 'Anak kandung atau anak asuh',
  },
  { label: 'Suami / Istri', value: 'spouse', description: 'Pasangan sah' },
  { label: 'Orang Tua', value: 'parent', description: 'Ayah atau Ibu' },
  {
    label: 'Saudara Kandung',
    value: 'relative',
    description: 'Kakak atau Adik kandung',
  },
  {
    label: 'Kerabat / Famili',
    value: 'relative',
    description: 'Keluarga besar atau kerabat dekat',
  },
  {
    label: 'Lainnya',
    value: 'other',
    description: 'Pihak lain yang didampingi',
  },
];

export const BACKEND_STATUS_OPTIONS: ReferenceOption[] = [
  {
    label: 'Aktif',
    value: 'Aktif',
    description: 'Pasien aktif menerima pelayanan kesehatan',
  },
  {
    label: 'Nonaktif',
    value: 'Nonaktif',
    description: 'Rekam medis pasien dinonaktifkan',
  },
];

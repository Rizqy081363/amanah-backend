import { bloodType } from '../../../../database/schema';

export interface ReferenceOption {
  label: string;
  value: string;
  description?: string;
}

export const BACKEND_GENDER_OPTIONS: ReferenceOption[] = [
  { label: 'Laki-laki', value: 'male' },
  { label: 'Perempuan', value: 'female' },
];

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

export function getBloodTypeDescription(val: string): string {
  switch (val) {
    case 'a_positive':
      return 'Golongan A Rhesus Positif (+)';
    case 'a_negative':
      return 'Golongan A Rhesus Negatif (-)';
    case 'b_positive':
      return 'Golongan B Rhesus Positif (+)';
    case 'b_negative':
      return 'Golongan B Rhesus Negatif (-)';
    case 'ab_positive':
      return 'Golongan AB Rhesus Positif (+)';
    case 'ab_negative':
      return 'Golongan AB Rhesus Negatif (-)';
    case 'o_positive':
      return 'Golongan O Rhesus Positif (+)';
    case 'o_negative':
      return 'Golongan O Rhesus Negatif (-)';
    case 'a':
      return 'Golongan A (Rhesus belum ditentukan)';
    case 'b':
      return 'Golongan B (Rhesus belum ditentukan)';
    case 'ab':
      return 'Golongan AB (Rhesus belum ditentukan)';
    case 'o':
      return 'Golongan O (Rhesus belum ditentukan)';
    case 'unknown':
      return 'Belum diperiksa / Tidak tahu';
    default:
      return formatBloodTypeDisplay(val);
  }
}

/**
 * 13 Pilihan Golongan Darah yang diturunkan secara dinamis dari Enum Database PostgreSQL ('blood_type')
 */
export const BACKEND_BLOOD_TYPE_OPTIONS: ReferenceOption[] =
  bloodType.enumValues.map((val) => ({
    label: formatBloodTypeDisplay(val),
    value: val,
    description: getBloodTypeDescription(val),
  }));

export type DatabaseBloodTypeEnum = (typeof bloodType.enumValues)[number];

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
export function normalizeBloodTypeToDb(
  input?: string | null,
): DatabaseBloodTypeEnum {
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
    value: 'active',
    description: 'Pasien aktif menerima pelayanan kesehatan',
  },
  {
    label: 'Nonaktif',
    value: 'inactive',
    description: 'Rekam medis pasien dinonaktifkan',
  },
];

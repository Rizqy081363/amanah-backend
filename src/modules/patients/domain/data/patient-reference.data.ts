import { bloodType } from '../../../../database/schema';

export const UNKNOWN_BLOOD_TYPE = 'unknown' as const;

export interface ReferenceOption {
  label: string;
  value: string;
  description?: string;
}

export const BACKEND_GENDER_OPTIONS: ReferenceOption[] = [
  { label: 'male', value: 'male' },
  { label: 'female', value: 'female' },
];

/**
 * Pemformat simbolis klinis dari nilai enum PostgreSQL ke representasi yang ramah pengguna.
 * Bersifat deterministik: otomatis mengubah simbol seperti 'a_positive' -> 'A+', 'o' -> 'O', 'unknown' -> 'Belum Tahu'.
 */
export function formatBloodTypeDisplay(raw?: string | null): string {
  if (!raw) return 'Belum Tahu';
  const clean = raw.trim().toLowerCase();
  if (clean === UNKNOWN_BLOOD_TYPE) return 'Belum Tahu';
  return clean
    .replace(/_positive$/i, '+')
    .replace(/_negative$/i, '-')
    .replace(/_/g, ' ')
    .toUpperCase();
}

/**
 * Deskripsi klinis standar untuk golongan darah.
 * Dihasilkan secara deterministik berdasarkan ada tidaknya rhesus dan simbol.
 */
export function getBloodTypeDescription(val: string): string {
  if (!val || val.trim().toLowerCase() === UNKNOWN_BLOOD_TYPE) {
    return 'Belum diperiksa / Tidak tahu';
  }
  const clean = val.trim().toLowerCase();
  const label = formatBloodTypeDisplay(clean);
  if (clean.endsWith('_positive') || clean.endsWith('+')) {
    return `Golongan ${label.replace('+', '')} Rhesus Positif (+)`;
  }
  if (clean.endsWith('_negative') || clean.endsWith('-')) {
    return `Golongan ${label.replace('-', '')} Rhesus Negatif (-)`;
  }
  return `Golongan ${label} (Rhesus belum ditentukan)`;
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

/**
 * Normalizer otoritatif yang memetakan input simbolik (A+, O-, Belum Tahu)
 * maupun identifier enum PostgreSQL (a_positive, unknown) ke enum database murni.
 * Bersifat deterministik dan langsung memverifikasi terhadap daftar nilai enum database.
 */
export function normalizeBloodTypeToDb(
  input?: string | null,
): DatabaseBloodTypeEnum {
  if (!input) return UNKNOWN_BLOOD_TYPE;
  const clean = input.trim().toLowerCase();

  const validEnums = bloodType.enumValues as readonly string[];
  if (validEnums.includes(clean)) {
    return clean as DatabaseBloodTypeEnum;
  }

  // Standarisasi simbol klinis (+ -> _positive, - -> _negative)
  const normalized = clean
    .replace(/\+/g, '_positive')
    .replace(/-/g, '_negative')
    .replace(/\s+/g, '_');

  if (validEnums.includes(normalized)) {
    return normalized as DatabaseBloodTypeEnum;
  }

  return UNKNOWN_BLOOD_TYPE;
}

export const BACKEND_RELATIONSHIP_OPTIONS: ReferenceOption[] = [
  { label: 'self', value: 'self' },
  { label: 'child', value: 'child' },
  { label: 'spouse', value: 'spouse' },
  { label: 'parent', value: 'parent' },
  { label: 'relative', value: 'relative' },
  { label: 'other', value: 'other' },
];

export const BACKEND_STATUS_OPTIONS: ReferenceOption[] = [
  {
    label: 'active',
    value: 'active',
  },
  {
    label: 'inactive',
    value: 'inactive',
  },
];

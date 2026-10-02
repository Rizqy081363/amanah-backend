export interface ReferenceOption {
  label: string;
  value: string;
  description?: string;
}

export const BACKEND_GENDER_OPTIONS: ReferenceOption[] = [
  { label: 'Laki-laki', value: 'Laki-laki' },
  { label: 'Perempuan', value: 'Perempuan' },
];

export const BACKEND_BLOOD_TYPE_OPTIONS: ReferenceOption[] = [
  { label: 'A', value: 'A' },
  { label: 'B', value: 'B' },
  { label: 'AB', value: 'AB' },
  { label: 'O', value: 'O' },
  { label: 'Belum Tahu', value: 'Belum Tahu' },
];

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

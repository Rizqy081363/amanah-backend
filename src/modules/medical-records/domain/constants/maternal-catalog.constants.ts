export interface ReferenceOptionItem {
  code: string;
  label: string;
  description?: string;
  displayOrder: number;
}

export const EDUCATION_LEVEL_OPTIONS: readonly ReferenceOptionItem[] = [
  { code: 'tidak_sekolah', label: 'Tidak sekolah', displayOrder: 1 },
  { code: 'sd', label: 'SD', displayOrder: 2 },
  { code: 'smp', label: 'SMP', displayOrder: 3 },
  { code: 'sma_smk', label: 'SMA/SMK', displayOrder: 4 },
  { code: 'd1_d3', label: 'D1-D3', displayOrder: 5 },
  { code: 's1', label: 'S1', displayOrder: 6 },
  { code: 's2_s3', label: 'S2/S3', displayOrder: 7 },
] as const;

export const RELIGION_OPTIONS: readonly ReferenceOptionItem[] = [
  { code: 'islam', label: 'Islam', displayOrder: 1 },
  { code: 'kristen', label: 'Kristen', displayOrder: 2 },
  { code: 'katolik', label: 'Katolik', displayOrder: 3 },
  { code: 'hindu', label: 'Hindu', displayOrder: 4 },
  { code: 'buddha', label: 'Buddha', displayOrder: 5 },
  { code: 'konghucu', label: 'Konghucu', displayOrder: 6 },
  { code: 'lainnya', label: 'Lainnya', displayOrder: 7 },
] as const;

export const TETANUS_STATUS_OPTIONS: readonly ReferenceOptionItem[] = [
  {
    code: 'Belum pernah',
    label: 'Belum pernah',
    description: 'Belum pernah mendapatkan imunisasi tetanus',
    displayOrder: 1,
  },
  {
    code: 'T1',
    label: 'T1',
    description: 'Dosis pertama saat kontak awal',
    displayOrder: 2,
  },
  {
    code: 'T2',
    label: 'T2',
    description: '4 minggu setelah T1 (perlindungan 3 tahun)',
    displayOrder: 3,
  },
  {
    code: 'T3',
    label: 'T3',
    description: '6 bulan setelah T2 (perlindungan 5 tahun)',
    displayOrder: 4,
  },
  {
    code: 'T4',
    label: 'T4',
    description: '1 tahun setelah T3 (perlindungan 10 tahun)',
    displayOrder: 5,
  },
  {
    code: 'T5',
    label: 'T5',
    description: '1 tahun setelah T4 (perlindungan 25 tahun atau seumur hidup)',
    displayOrder: 6,
  },
] as const;

export const DELIVERY_METHOD_OPTIONS: readonly ReferenceOptionItem[] = [
  { code: 'normal_spontan', label: 'Normal / Spontan', displayOrder: 1 },
  { code: 'caesar_sc', label: 'Sectio Caesarea (SC)', displayOrder: 2 },
  { code: 'vakum', label: 'Vakum / Ekstraksi Vakum', displayOrder: 3 },
  { code: 'forsep', label: 'Forsep', displayOrder: 4 },
  { code: 'lainnya', label: 'Lainnya', displayOrder: 5 },
] as const;

export const DELIVERY_PLACE_OPTIONS: readonly ReferenceOptionItem[] = [
  { code: 'rumah_sakit', label: 'Rumah Sakit', displayOrder: 1 },
  {
    code: 'klinik_bersalin',
    label: 'Klinik Bersalin / Faskes',
    displayOrder: 2,
  },
  { code: 'puskesmas', label: 'Puskesmas', displayOrder: 3 },
  {
    code: 'praktik_mandiri_bidan',
    label: 'Praktik Mandiri Bidan (PMB)',
    displayOrder: 4,
  },
  { code: 'rumah', label: 'Rumah Pasien', displayOrder: 5 },
  { code: 'lainnya', label: 'Lainnya', displayOrder: 6 },
] as const;

export const CHILD_SEX_OPTIONS: readonly ReferenceOptionItem[] = [
  { code: 'Laki-laki', label: 'Laki-laki', displayOrder: 1 },
  { code: 'Perempuan', label: 'Perempuan', displayOrder: 2 },
] as const;

export const BIRTH_ATTENDANT_OPTIONS: readonly ReferenceOptionItem[] = [
  {
    code: 'spog',
    label: 'Dokter Spesialis Kandungan (Sp.OG)',
    displayOrder: 1,
  },
  { code: 'dokter_umum', label: 'Dokter Umum', displayOrder: 2 },
  { code: 'bidan', label: 'Bidan', displayOrder: 3 },
  {
    code: 'tenaga_kesehatan_lain',
    label: 'Tenaga Kesehatan Lain',
    displayOrder: 4,
  },
  {
    code: 'dukun_bayi_keluarga',
    label: 'Keluarga / Dukun Bayi',
    displayOrder: 5,
  },
  { code: 'lainnya', label: 'Lainnya', displayOrder: 6 },
] as const;

export const CONTRACEPTIVE_TYPE_OPTIONS: readonly ReferenceOptionItem[] = [
  { code: 'suntik_3_bulan', label: 'Suntik 3 Bulan', displayOrder: 1 },
  { code: 'suntik_1_bulan', label: 'Suntik 1 Bulan', displayOrder: 2 },
  { code: 'pil_kb', label: 'Pil KB', displayOrder: 3 },
  { code: 'iud_spiral', label: 'IUD / Spiral', displayOrder: 4 },
  { code: 'implan_susuk', label: 'Implan / Susuk', displayOrder: 5 },
  { code: 'kondom', label: 'Kondom', displayOrder: 6 },
  { code: 'mow_tubektomi', label: 'MOW / Tubektomi', displayOrder: 7 },
  { code: 'mop_vasektomi', label: 'MOP / Vasektomi', displayOrder: 8 },
  { code: 'alami_kalender', label: 'Alami / Kalender', displayOrder: 9 },
  { code: 'lainnya', label: 'Lainnya', displayOrder: 10 },
] as const;

export const OCCUPATION_OPTIONS: readonly ReferenceOptionItem[] = [
  {
    code: 'pns_tni_polri',
    label: 'Pegawai Negeri Sipil / TNI / Polri',
    displayOrder: 1,
  },
  { code: 'karyawan_swasta', label: 'Karyawan Swasta', displayOrder: 2 },
  { code: 'wiraswasta', label: 'Wiraswasta / Pengusaha', displayOrder: 3 },
  { code: 'ibu_rumah_tangga', label: 'Ibu Rumah Tangga', displayOrder: 4 },
  { code: 'pelajar_mahasiswa', label: 'Pelajar / Mahasiswa', displayOrder: 5 },
  { code: 'guru_dosen', label: 'Guru / Dosen', displayOrder: 6 },
  { code: 'tenaga_medis', label: 'Tenaga Medis / Kesehatan', displayOrder: 7 },
  { code: 'petani_peternak', label: 'Petani / Peternak', displayOrder: 8 },
  { code: 'nelayan', label: 'Nelayan', displayOrder: 9 },
  { code: 'buruh', label: 'Buruh Harian Lepas', displayOrder: 10 },
  { code: 'pensiunan', label: 'Pensiunan', displayOrder: 11 },
  { code: 'belum_bekerja', label: 'Belum / Tidak Bekerja', displayOrder: 12 },
  { code: 'lainnya', label: 'Lainnya', displayOrder: 13 },
] as const;

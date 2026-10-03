export interface VaccineCatalogSeedItem {
  code: string;
  name: string;
  ageMilestone: string;
  scheduleMonths: number;
  altGroup?: string;
  description: string;
  sortOrder: number;
}

export const DEFAULT_VACCINE_CATALOG: readonly VaccineCatalogSeedItem[] = [
  {
    code: 'HB_0',
    name: 'HB 0',
    ageMilestone: 'Saat Lahir',
    scheduleMonths: 0,
    description:
      'Suntikan pencegah hepatitis B (penyakit hati), diberikan dalam 24 jam pertama setelah lahir.',
    sortOrder: 1,
  },
  {
    code: 'BCG',
    name: 'BCG',
    ageMilestone: '1 Bulan',
    scheduleMonths: 1,
    description: 'Suntikan pencegah TBC berat pada anak.',
    sortOrder: 2,
  },
  {
    code: 'PENTA_1',
    name: 'Penta 1',
    ageMilestone: '2 Bulan',
    scheduleMonths: 2,
    altGroup: 'PENTA_HEXA_1',
    description:
      'Suntikan 5-in-1: difteri, batuk rejan, tetanus, hepatitis B, dan Hib.',
    sortOrder: 3,
  },
  {
    code: 'IPV_1',
    name: 'IPV 1',
    ageMilestone: '2 Bulan',
    scheduleMonths: 2,
    altGroup: 'PENTA_HEXA_1',
    description: 'Suntikan polio (IPV 1).',
    sortOrder: 4,
  },
  {
    code: 'HEXA_1',
    name: 'Heksavalen 1',
    ageMilestone: '2 Bulan',
    scheduleMonths: 2,
    altGroup: 'PENTA_HEXA_1',
    description:
      'Suntikan kombo 6-in-1: mencakup Penta 1 ditambah polio suntik (IPV 1).',
    sortOrder: 5,
  },
  {
    code: 'PCV_1',
    name: 'PCV 1',
    ageMilestone: '2 Bulan',
    scheduleMonths: 2,
    description:
      'Suntikan pencegah infeksi bakteri pneumokokus (radang paru, radang selaput otak).',
    sortOrder: 6,
  },
  {
    code: 'RV_1',
    name: 'RV 1',
    ageMilestone: '2 Bulan',
    scheduleMonths: 2,
    description: 'Tetes di mulut untuk mencegah diare berat akibat rotavirus.',
    sortOrder: 7,
  },
  {
    code: 'PENTA_2',
    name: 'Penta 2',
    ageMilestone: '3 Bulan',
    scheduleMonths: 3,
    altGroup: 'PENTA_HEXA_2',
    description:
      'Suntikan 5-in-1: difteri, batuk rejan, tetanus, hepatitis B, dan Hib dosis ke-2.',
    sortOrder: 8,
  },
  {
    code: 'IPV_2',
    name: 'IPV 2',
    ageMilestone: '3 Bulan',
    scheduleMonths: 3,
    altGroup: 'PENTA_HEXA_2',
    description: 'Suntikan polio (IPV 2).',
    sortOrder: 9,
  },
  {
    code: 'HEXA_2',
    name: 'Heksavalen 2',
    ageMilestone: '3 Bulan',
    scheduleMonths: 3,
    altGroup: 'PENTA_HEXA_2',
    description:
      'Suntikan kombo 6-in-1: mencakup Penta 2 ditambah polio suntik (IPV 2).',
    sortOrder: 10,
  },
  {
    code: 'PCV_2',
    name: 'PCV 2',
    ageMilestone: '3 Bulan',
    scheduleMonths: 3,
    description: 'Suntikan pencegah infeksi bakteri pneumokokus dosis ke-2.',
    sortOrder: 11,
  },
  {
    code: 'RV_2',
    name: 'RV 2',
    ageMilestone: '3 Bulan',
    scheduleMonths: 3,
    description:
      'Tetes di mulut untuk mencegah diare berat akibat rotavirus dosis ke-2.',
    sortOrder: 12,
  },
  {
    code: 'PENTA_3',
    name: 'Penta 3',
    ageMilestone: '4 Bulan',
    scheduleMonths: 4,
    altGroup: 'PENTA_HEXA_3',
    description:
      'Suntikan 5-in-1: difteri, batuk rejan, tetanus, hepatitis B, dan Hib dosis ke-3.',
    sortOrder: 13,
  },
  {
    code: 'IPV_3',
    name: 'IPV 3',
    ageMilestone: '4 Bulan',
    scheduleMonths: 4,
    altGroup: 'PENTA_HEXA_3',
    description: 'Suntikan polio (IPV 3).',
    sortOrder: 14,
  },
  {
    code: 'HEXA_3',
    name: 'Heksavalen 3',
    ageMilestone: '4 Bulan',
    scheduleMonths: 4,
    altGroup: 'PENTA_HEXA_3',
    description:
      'Suntikan kombo 6-in-1: mencakup Penta 3 ditambah polio suntik (IPV 3).',
    sortOrder: 15,
  },
  {
    code: 'RV_3',
    name: 'RV 3',
    ageMilestone: '4 Bulan',
    scheduleMonths: 4,
    description:
      'Tetes di mulut untuk mencegah diare berat akibat rotavirus dosis ke-3.',
    sortOrder: 16,
  },
  {
    code: 'MR',
    name: 'MR',
    ageMilestone: '9 Bulan',
    scheduleMonths: 9,
    description: 'Suntikan pencegah campak dan rubela.',
    sortOrder: 17,
  },
  {
    code: 'JE',
    name: 'JE',
    ageMilestone: '10 Bulan',
    scheduleMonths: 10,
    description:
      'Suntikan pencegah radang otak akibat virus Japanese Encephalitis.',
    sortOrder: 18,
  },
  {
    code: 'PCV_B',
    name: 'PCV-B',
    ageMilestone: '12 Bulan',
    scheduleMonths: 12,
    description: 'Suntikan lanjutan (booster) PCV.',
    sortOrder: 19,
  },
  {
    code: 'PENTA_B',
    name: 'Penta-B',
    ageMilestone: '18 Bulan',
    scheduleMonths: 18,
    description: 'Suntikan lanjutan (booster) DPT-HB-Hib.',
    sortOrder: 20,
  },
  {
    code: 'MR_B',
    name: 'MR-B',
    ageMilestone: '18 Bulan',
    scheduleMonths: 18,
    description: 'Suntikan lanjutan (booster) Campak Rubela.',
    sortOrder: 21,
  },
] as const;

export interface CreateMaternalIntakeSeedOptions {
  patientId: string;
  appointmentId?: string;
  motherNik?: string;
  motherName?: string;
  hpht?: string;
  estimatedDueDate?: string;
  gravidaCount?: number;
  parityCount?: number;
  abortionCount?: number;
  livingChildrenCount?: number;
  currentComplaints?: string;
}

export function createMaternalIntakeSeed(
  options: CreateMaternalIntakeSeedOptions,
) {
  const motherNik =
    options.motherNik ||
    `3201${Math.floor(100000000000 + Math.random() * 900000000000)}`;
  const motherName = options.motherName || 'Ny. Siti Nurjanah';
  const gravidaCount = options.gravidaCount ?? 2;
  const parityCount = options.parityCount ?? 1;
  const abortionCount = options.abortionCount ?? 0;
  const livingChildrenCount = options.livingChildrenCount ?? 1;

  const previousPregnancies =
    parityCount > 0
      ? [
          {
            orderNumber: 1,
            birthYear: '2023',
            birthWeightGrams: 3150,
            birthLengthCm: 49.0,
            childSex: 'Laki-laki',
            gestationalAgeAtBirth: '39 minggu',
            birthAttendant: 'Bdn. Siti Rahmawati',
            deliveryMethod: 'Normal/spontan',
            deliveryPlace: 'Klinik Amanah HealthCare',
            complications: 'Tidak ada',
          },
        ]
      : [];

  const contraceptiveHistories = [
    {
      orderNumber: 1,
      startDate: '2023-08-01',
      contraceptiveType: 'Suntik 3 bulan',
      durationText: '1 tahun 6 bulan',
      stopDate: '2025-02-01',
      problems: 'Tidak ada keluhan',
      sideEffects: 'Siklus haid tidak teratur',
    },
  ];

  return {
    patientId: options.patientId,
    appointmentId: options.appointmentId || null,
    motherNik,
    motherName,
    motherBirthDate: '1996-03-24',
    motherAge: 30,
    marriageOrder: 1,
    marriageDate: '2021-11-12',
    motherJob: 'Karyawan Swasta',
    motherEducation: 'S1',
    religion: 'Islam',
    phoneNumber: '081298765432',
    domicileAddress: 'Jl. Anyelir 1 No. 243, Condongcatur, Sleman, Yogyakarta',
    identityCardAddress:
      'Jl. Anyelir 1 No. 243, Condongcatur, Sleman, Yogyakarta',
    dasawisma: 'Dahlia 4',
    posyandu: 'Posyandu Melati',
    puskesmas: 'Puskesmas Depok II',
    partnerName: 'Tn. Hendra Saputra',
    partnerNik: `3201${Math.floor(100000000000 + Math.random() * 900000000000)}`,
    partnerBirthDate: '1994-07-15',
    partnerAge: 32,
    partnerJob: 'Wiraswasta',
    partnerEducation: 'S1',
    partnerBloodType: 'B',
    heightCm: 159,
    prePregnancyWeightKg: 53.5,
    upperArmCircumferenceCm: 25.0,
    initialBmi: 21.2,
    tetanusStatus: 'T3',
    motherBloodType: 'O',
    hpht: options.hpht || '2026-02-01',
    estimatedDueDate: options.estimatedDueDate || '2026-11-08',
    gestationalAgeWeeks: 12,
    gestationalAgeFormatted: '12 minggu 2 hari',
    currentComplaints:
      options.currentComplaints ||
      'Mual muntah ringan di pagi hari, pusing sepintas',
    gravidaCount,
    parityCount,
    abortionCount,
    livingChildrenCount,
    hasPreviousPregnancyHistory: parityCount > 0,
    hasContraceptionHistory: true,
    smokedBeforePregnancy: 'Tidak',
    alcoholBeforePregnancy: false,
    irregularDietBeforePregnancy: false,
    reducedPhysicalActivityBeforePregnancy: false,
    unprescribedMedicationBeforePregnancy: false,
    concerningCosmeticUseBeforePregnancy: false,
    pesticideExposureBeforePregnancy: false,
    chemicalExposureBeforePregnancy: false,
    smokeExposureBeforePregnancy: false,
    concerningEnvironmentNotes: 'Tidak ada',
    allergyInfo: 'Tidak ada alergi',
    otherNotes: 'Merencanakan persalinan normal di Klinik Amanah',
    diseaseHistory: {
      hasHypertensionHistory: 'Tidak',
      hasDiabetesHistory: 'Tidak',
      hasAsthmaHistory: 'Tidak',
      hasHeartDiseaseHistory: 'Tidak',
    },
    previousPregnancies,
    contraceptiveHistories,
  };
}

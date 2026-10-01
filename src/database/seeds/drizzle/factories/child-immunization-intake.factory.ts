export interface CreateChildImmunizationSeedOptions {
  patientId: string;
  appointmentId?: string;
  childNik?: string;
  childName?: string;
  childBirthDate?: string;
  childSex?: 'Laki-laki' | 'Perempuan';
  parentPhone?: string;
  fatherName?: string;
  motherName?: string;
  previousVaccineHistory?: string;
}

export function createChildImmunizationSeed(
  options: CreateChildImmunizationSeedOptions,
) {
  const childNik =
    options.childNik ||
    `3201${Math.floor(100000000000 + Math.random() * 900000000000)}`;
  const childName = options.childName || 'Ananda Bilal Al-Ghifari';

  return {
    patientId: options.patientId,
    appointmentId: options.appointmentId || null,
    childName,
    childNik,
    childBirthDate: options.childBirthDate || '2025-08-20',
    childSex: options.childSex || 'Laki-laki',
    childAgeFormatted: '1 tahun 1 bulan',
    parentPhone: options.parentPhone || '081298765432',
    fatherName: options.fatherName || 'Tn. Hendra Saputra',
    motherName: options.motherName || 'Ny. Siti Nurjanah',
    childAddress: 'Jl. Anyelir 1 No. 243, Condongcatur, Sleman, Yogyakarta',
    previousVaccineHistory:
      options.previousVaccineHistory ||
      'HB 0 (0 hari), BCG & Polio 1 (1 bulan), DPT-HB-Hib 1, 2, 3 & Polio 2, 3, 4 (2, 3, 4 bulan), Campak/MR (9 bulan)',
    childAllergyHistory: 'Tidak ada riwayat alergi obat atau makanan',
  };
}

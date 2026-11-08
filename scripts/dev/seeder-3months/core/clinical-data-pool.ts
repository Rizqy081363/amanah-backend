export interface ClinicalCasePreset {
  serviceCode: string;
  complaint: string;
  subjectiveNotes: string;
  objectiveNotes: string;
  assessment: string;
  plan: string;
}

export const GENERAL_CASES: ClinicalCasePreset[] = [
  {
    serviceCode: 'pemeriksaan_dokter_umum',
    complaint: 'Pusing berputar dan nyeri kepala sejak 2 hari terakhir',
    subjectiveNotes: 'Pasien mengeluh pusing seperti berputar hilang timbul terutama saat perubahan posisi kepala. Mual ringan, tidak muntah. Riwayat hipertensi tidak rutin minum obat.',
    objectiveNotes: 'KU: Baik, CM. TD: 145/90 mmHg, HR: 82x/m, RR: 18x/m, Temp: 36.6 C. Kepala: normocephal, konjungtiva tidak anemis. Thorax: vesikuler, ronki -/-, wheezing -/-. Abdomen: supel, bising usus normal.',
    assessment: 'I10 - Hipertensi Esensial (Derajat I) + H81.1 - Vertigo Posisi Paroksismal Jinak',
    plan: 'Amlodipine 5mg 1x1 tab pagi p.c., Betahistine mesilate 6mg 3x1 tab p.c., Paracetamol 500mg 3x1 prn. Edukasi hindari gerakan tiba-tiba, diet rendah garam (kurangi natrium), kontrol 1 minggu.',
  },
  {
    serviceCode: 'pemeriksaan_dokter_umum',
    complaint: 'Batuk berdahak disertai demam dan badan pegal 3 hari',
    subjectiveNotes: 'Batuk berdahak warna putih kekuningan, pilek dengan hidung tersumbat. Demam naik turun sejak 3 hari yang lalu. Nyeri tenggorokan saat menelan.',
    objectiveNotes: 'KU: Sedang, CM. TD: 118/75 mmHg, HR: 88x/m, RR: 20x/m, Temp: 37.8 C. Faring: hiperemis (+), tonsil T1/T1 tidak membesar. Cor/Pulmo dalam batas normal. Ekstremitas akral hangat.',
    assessment: 'J06.9 - Infeksi Saluran Pernapasan Akut Atas (ISPA) / Nasofaringitis Akut',
    plan: 'Paracetamol 500mg 3x1 tab p.c., Ambroxol 30mg 3x1 tab p.c., Cetirizine 10mg 1x1 tab malam, Vitamin C 500mg 1x1. Istirahat cukup, perbanyak minum air hangat, gunakan masker.',
  },
  {
    serviceCode: 'pemeriksaan_dokter_umum',
    complaint: 'Nyeri ulu hati terasa perih, mual dan kembung',
    subjectiveNotes: 'Pasien merasakan perih di ulu hati terutama saat telat makan dan setelah makan pedas/kopi. Mual (+) bersendawa sering, perut terasa begah.',
    objectiveNotes: 'KU: Baik, CM. TD: 120/80 mmHg, HR: 76x/m, RR: 18x/m, Temp: 36.5 C. Abdomen: nyeri tekan regio epigastrium (+), hepar/lien tidak teraba membesar, bising usus (+) normal 8x/menit.',
    assessment: 'K29.7 - Gastritis Akut / Dispepsia Sindrom',
    plan: 'Omeprazole 20mg 2x1 cap a.c. (30 menit sebelum makan), Antasida DOEN 3x1 tab kunyah 1 jam p.c., Domperidone 10mg 3x1 a.c. prn mual. Edukasi makan porsi kecil sering, hindari pedas/asam/kafein.',
  },
  {
    serviceCode: 'pemeriksaan_dokter_umum',
    complaint: 'Pemeriksaan rutin berkala dan kontrol gula darah',
    subjectiveNotes: 'Pasien datang untuk kontrol rutin bulanan DM Tipe 2. Tidak ada keluhan khas kesemutan di ujung jari, luka sembuh baik, nafsu makan dan BAK normal.',
    objectiveNotes: 'KU: Baik, CM. TD: 125/80 mmHg, HR: 78x/m, RR: 18x/m, Temp: 36.4 C, BB: 68 kg, TB: 165 cm, BMI: 25. GDS stik: 142 mg/dL. Status lokalis ekstremitas inferior: sensorik baik, pulsasi arteri dorsalis pedis kuat.',
    assessment: 'E11.9 - Diabetes Mellitus Tipe 2 Terkontrol Tanpa Komplikasi',
    plan: 'Metformin 500mg 2x1 tab d.c. (saat makan), Glimepiride 2mg 1x1 tab pagi a.c., edukasi diet DM 1700 kkal, olahraga jalan kaki 30 menit 3x seminggu, periksa HbA1c 3 bulan berikutnya.',
  },
  {
    serviceCode: 'surat_keterangan_sehat',
    complaint: 'Pemeriksaan fisik untuk permohonan surat keterangan sehat kerja',
    subjectiveNotes: 'Pasien tidak memiliki keluhan sakit fisik. Tidak ada riwayat penyakit kronis, asma, maupun alergi obat berat.',
    objectiveNotes: 'KU: Baik, CM. TD: 115/75 mmHg, HR: 74x/m, RR: 16x/m, Temp: 36.5 C, BB: 60 kg, TB: 168 cm. Tajam penglihatan 6/6 ODS, buta warna negatif (Ishihara 14/14). Fisik organ vital normal.',
    assessment: 'Z02.1 - Pemeriksaan Pra-Kerja / Sehat Jasmani & Rohani',
    plan: 'Diterbitkan Surat Keterangan Sehat resmi klinik untuk keperluan administrasi kerja/pendidikan.',
  },
];

export const MATERNAL_CASES: ClinicalCasePreset[] = [
  {
    serviceCode: 'pemeriksaan_kehamilan',
    complaint: 'Kontrol rutin kehamilan trimester II usia gestasi 24 minggu',
    subjectiveNotes: 'Ibu hamil anak kedua (G2P1A0). Gerakan janin dirasakan aktif sejak usia 20 minggu. Keluhan pusing atau pandangan kabur disangkal. Nafsu makan baik.',
    objectiveNotes: 'KU: Baik, CM. TD: 110/70 mmHg, HR: 80x/m, RR: 18x/m, Suhu: 36.6 C. BB: 58 kg (naik 1.5 kg dari bulan lalu). TFU: 22 cm, Leopold I: teraba bokong, Leopold II: punggung kiri (puki), DJJ: 144x/menit reguler kuat. Edema tungkai: -/-.',
    assessment: 'Z34.8 - Pengawasan Kehamilan Normal G2P1A0 Gravida 24 Minggu Janin Tunggal Hidup Intrauterin',
    plan: 'Asam Folat 400mcg 1x1, Tablet Tambah Darah (Ferrous Fumarate) 1x1 malam, Kalsium Laktat 500mg 1x1 pagi. Edukasi tanda bahaya kehamilan trimester 2 & senam hamil.',
  },
  {
    serviceCode: 'usg_kandungan',
    complaint: 'Pemeriksaan USG kandungan kontrol trimester III',
    subjectiveNotes: 'Pasien datang untuk evaluasi perkembangan janin dan letak plasenta usia kehamilan 32 minggu. Gerakan janin aktif.',
    objectiveNotes: 'USG 2D/4D Obstetri: Janin tunggal hidup intrauterin, presentasi kepala. BPD: 8.2 cm, AC: 28.1 cm, FL: 6.3 cm, EFW: ~1950 gram. AFI (Air Ketuban): cukup (12 cm). Plasenta di korpus posterior grade II, tidak menutupi OUI.',
    assessment: 'Z36.8 - Skrining Antenatal Ultrasonografi Janin Sesuai Gestasi 32 Minggu',
    plan: 'Kondisi janin baik dan perkembangan sesuai usia gestasi. Lanjutkan suplemen kehamilan, pantau gerak janin minimal 10 kali dalam 12 jam, kontrol ulang 3 minggu lagi.',
  },
  {
    serviceCode: 'imunisasi_anak',
    complaint: 'Jadwal imunisasi wajib bayi usia 2 bulan',
    subjectiveNotes: 'Ibu membawa bayinya untuk jadwal imunisasi DPT-HB-Hib 1 dan Polio 2. Bayi sehat, menyusu ASI aktif, tidak ada batuk, pilek, atau demam.',
    objectiveNotes: 'Bayi usia 2 bulan 5 hari. BB: 5.2 kg, PB: 57 cm, LK: 38 cm, Temp: 36.7 C. Refleks hisap kuat, fontanela anterior rata, turgor kulit baik, jantung/paru normal.',
    assessment: 'Z23 - Imunisasi Kombinasi DPT-HB-Hib Dosis I + Vaksin Polio Oral Dosis II',
    plan: 'Injeksi vaksin DPT-HB-Hib 1 dosis 0.5 ml IM pada paha kiri anterolateral + OPV 2 tetes oral. Paracetamol sirup drops 100mg/ml dosis 0.5 ml prn demam pasca imunisasi. Edukasi kompres air biasa bila nyeri di area suntikan.',
  },
  {
    serviceCode: 'keluarga_berencana',
    complaint: 'Kunjungan ulang pelayanan kontrasepsi suntik KB 3 bulan',
    subjectiveNotes: 'Ibu menyusui anak usia 8 bulan, datang tepat waktu untuk jadwal suntik ulang KB 3 bulanan. Tidak ada keluhan pusing hebat atau perdarahan bercak abnormal.',
    objectiveNotes: 'KU: Baik, CM. TD: 115/75 mmHg, BB: 54 kg, HR: 76x/m. Palpasi abdomen tidak teraba massa. Tes kehamilan urin (PP Test): Negatif.',
    assessment: 'Z30.42 - Kunjungan Ulang Pengawasan Kontrasepsi Medroxyprogesterone (Suntik 3 Bulan)',
    plan: 'Pemberian injeksi DMPA 150 mg IM pada regio gluteus kanan/kiri secara aseptis. Edukasi jadwal kunjungan suntik berikutnya tercatat pada kartu KB (12 minggu kemudian).',
  },
];

export function getRandomClinicalCase(serviceCode: string): ClinicalCasePreset {
  if (serviceCode.includes('kehamilan') || serviceCode.includes('usg') || serviceCode.includes('imunisasi') || serviceCode.includes('berencana') || serviceCode.includes('nifas')) {
    const subset = MATERNAL_CASES.filter((c) => c.serviceCode === serviceCode);
    const pool = subset.length > 0 ? subset : MATERNAL_CASES;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const subset = GENERAL_CASES.filter((c) => c.serviceCode === serviceCode);
  const pool = subset.length > 0 ? subset : GENERAL_CASES;
  return pool[Math.floor(Math.random() * pool.length)];
}

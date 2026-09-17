import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class VitalSignsDto {
  @ApiPropertyOptional({
    example: 120,
    description: 'Tekanan Darah Sistolik (mmHg)',
  })
  @IsNumber()
  @IsOptional()
  systolic?: number;

  @ApiPropertyOptional({
    example: 80,
    description: 'Tekanan Darah Diastolik (mmHg)',
  })
  @IsNumber()
  @IsOptional()
  diastolic?: number;

  @ApiPropertyOptional({
    example: 80,
    description: 'Detak Jantung / Nadi (bpm)',
  })
  @IsNumber()
  @IsOptional()
  heartRate?: number;

  @ApiPropertyOptional({
    example: 20,
    description: 'Laju Pernapasan (x/menit)',
  })
  @IsNumber()
  @IsOptional()
  respiratoryRate?: number;

  @ApiPropertyOptional({ example: 36.6, description: 'Suhu Tubuh (Celcius)' })
  @IsNumber()
  @IsOptional()
  temperature?: number;

  @ApiPropertyOptional({ example: 55.5, description: 'Berat Badan (kg)' })
  @IsNumber()
  @IsOptional()
  weightKg?: number;

  @ApiPropertyOptional({ example: 160, description: 'Tinggi Badan (cm)' })
  @IsNumber()
  @IsOptional()
  heightCm?: number;

  @ApiPropertyOptional({
    example: 98,
    description: 'Saturasi Oksigen SpO2 (%)',
  })
  @IsNumber()
  @IsOptional()
  oxygenSaturation?: number;

  @ApiPropertyOptional({
    example: 'Compos Mentis',
    description: 'Tingkat Kesadaran',
  })
  @IsString()
  @IsOptional()
  consciousness?: string;
}

export class PrescriptionItemDto {
  @ApiProperty({
    example: 'Amoxicillin 500mg',
    description: 'Nama Obat dan Dosis',
  })
  @IsString()
  @IsNotEmpty()
  namaObat: string;

  @ApiProperty({ example: 10, description: 'Jumlah / Kuantitas' })
  @IsNumber()
  @IsNotEmpty()
  jumlah: number;

  @ApiProperty({
    example: 'tablet',
    description: 'Satuan (tablet/kapsul/sirup/botol)',
  })
  @IsString()
  @IsNotEmpty()
  satuan: string;

  @ApiProperty({
    example: '3x1 tablet sesudah makan',
    description: 'Aturan Pakai / Frekuensi',
  })
  @IsString()
  @IsNotEmpty()
  aturanPakai: string;

  @ApiPropertyOptional({
    example: 'Habiskan obat antibiotik ini',
    description: 'Catatan tambahan instruksi resep',
  })
  @IsString()
  @IsOptional()
  catatan?: string;
}

export class CreateMedicalRecordDto {
  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'ID Kunjungan / Appointment yang terkait',
  })
  @IsUUID()
  @IsOptional()
  kunjunganId?: string;

  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440001',
    description: 'ID Profil Pasien (patientProfiles.id)',
  })
  @IsUUID()
  @IsNotEmpty()
  patientId: string;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440002',
    description: 'ID Dokter/Praktisi (practitioners.id atau staffProfileId)',
  })
  @IsUUID()
  @IsOptional()
  staffId?: string;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440003',
    description: 'ID Layanan Medis (clinicServices.id)',
  })
  @IsUUID()
  @IsOptional()
  serviceId?: string;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440004',
    description: 'ID Medical Intake / Skrining Awal jika ada',
  })
  @IsUUID()
  @IsOptional()
  sourceIntakeId?: string;

  @ApiPropertyOptional({
    example: '2026-09-17',
    description: 'Tanggal pemeriksaan (YYYY-MM-DD)',
  })
  @IsString()
  @IsOptional()
  encounterDate?: string;

  @ApiPropertyOptional({
    enum: ['planned', 'in_progress', 'completed', 'cancelled'],
    default: 'completed',
    description: 'Status encounter klinis',
  })
  @IsEnum(['planned', 'in_progress', 'completed', 'cancelled'])
  @IsOptional()
  status?: 'planned' | 'in_progress' | 'completed' | 'cancelled';

  // SOAP - Subjective
  @ApiPropertyOptional({
    example:
      'Pasien mengeluh mual muntah di pagi hari dan pusing sejak 3 hari yang lalu.',
    description: 'Subjective: Anamnesa & keluhan utama pasien',
  })
  @IsString()
  @IsOptional()
  subjective?: string;

  // SOAP - Objective
  @ApiPropertyOptional({
    example:
      'Keadaan umum baik, konjungtiva tidak anemis, sklera tidak ikterik, abdomen lemas.',
    description: 'Objective: Catatan pemeriksaan fisik dokter',
  })
  @IsString()
  @IsOptional()
  objectiveNotes?: string;

  @ApiPropertyOptional({
    type: VitalSignsDto,
    description: 'Tanda-Tanda Vital (TTV) / Physical measurements',
  })
  @ValidateNested()
  @Type(() => VitalSignsDto)
  @IsOptional()
  vitalSigns?: VitalSignsDto;

  // SOAP - Assessment
  @ApiPropertyOptional({
    example: 'Hiperemesis Gravidarum Grade 1',
    description: 'Assessment / Diagnosa kerja dokter',
  })
  @IsString()
  @IsOptional()
  diagnosis?: string;

  @ApiPropertyOptional({
    example: 'O21.0',
    description: 'Kode Diagnosa ICD-10',
  })
  @IsString()
  @IsOptional()
  diagnosisIcd10Code?: string;

  @ApiPropertyOptional({
    example: 'Mild hyperemesis gravidarum',
    description: 'Deskripsi standar ICD-10',
  })
  @IsString()
  @IsOptional()
  diagnosisIcd10Name?: string;

  // SOAP - Plan
  @ApiPropertyOptional({
    example: 'USG Kandungan dasar, konseling nutrisi porsi kecil tapi sering.',
    description: 'Tindakan medis dan edukasi pasien',
  })
  @IsString()
  @IsOptional()
  tindakan?: string;

  @ApiPropertyOptional({
    example:
      'Vitamin B6 3x1 tablet, Ondansetron 4mg 2x1 tablet (bila mual hebat)',
    description: 'Catatan resep obat (ringkasan teks)',
  })
  @IsString()
  @IsOptional()
  resepObat?: string;

  @ApiPropertyOptional({
    type: [PrescriptionItemDto],
    description: 'Daftar item resep obat terstruktur',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrescriptionItemDto)
  @IsOptional()
  prescriptions?: PrescriptionItemDto[];

  @ApiPropertyOptional({
    example:
      'Istirahat cukup, hindari makanan berlemak dan berbau tajam. Kontrol 1 minggu lagi.',
    description: 'Catatan medis tambahan / instruksi kepulangan',
  })
  @IsString()
  @IsOptional()
  catatanMedis?: string;

  // Flow & KIA
  @ApiPropertyOptional({
    enum: ['pregnancy', 'immunization', 'general'],
    default: 'general',
    description: 'Kategori alur medis (KIA Kehamilan, Imunisasi, atau Umum)',
  })
  @IsEnum(['pregnancy', 'immunization', 'general'])
  @IsOptional()
  flowType?: 'pregnancy' | 'immunization' | 'general';

  @ApiPropertyOptional({
    example: '3201234567890001',
    description: 'NIK Ibu (untuk KIA)',
  })
  @IsString()
  @IsOptional()
  motherNik?: string;

  @ApiPropertyOptional({
    example: '3201234567890002',
    description: 'NIK Suami / Pasangan',
  })
  @IsString()
  @IsOptional()
  partnerNik?: string;

  @ApiPropertyOptional({
    example: '3201234567890003',
    description: 'NIK Anak (untuk Imunisasi)',
  })
  @IsString()
  @IsOptional()
  childNik?: string;

  @ApiPropertyOptional({
    example: {
      hpht: '2026-01-10',
      hpl: '2026-10-17',
      gpa: 'G1P0A0',
      tfu: 24,
      djj: 140,
    },
    description:
      'Data formulir klinis terperinci (ANC, Partus, atau Imunisasi)',
  })
  @IsObject()
  @IsOptional()
  formData?: Record<string, any>;

  @ApiPropertyOptional({
    example: { skorPoedjiRochjati: 2, kategoriRisiko: 'KRR (Risiko Rendah)' },
    description: 'Data kalkulasi otomatis dari skor risiko atau usia kehamilan',
  })
  @IsObject()
  @IsOptional()
  computedData?: Record<string, any>;
}

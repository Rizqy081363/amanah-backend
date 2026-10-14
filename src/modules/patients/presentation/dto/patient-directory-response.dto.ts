import { ApiProperty } from '@nestjs/swagger';

export class PatientDirectoryItemDto {
  @ApiProperty({ description: 'ID unik pasien (UUID)' })
  id: string;

  @ApiProperty({ description: 'Nomor Rekam Medis (MRN)' })
  medicalRecordNumber: string;

  @ApiProperty({ description: 'Nama lengkap pasien' })
  fullName: string;

  @ApiProperty({
    description: 'NIK yang telah disensor demi privasi data',
    nullable: true,
    example: '3201********0001',
  })
  maskedNik: string | null;

  @ApiProperty({ enum: ['male', 'female'], description: 'Jenis kelamin' })
  gender: 'male' | 'female';

  @ApiProperty({ description: 'Tanggal lahir (YYYY-MM-DD)' })
  birthDate: string;

  @ApiProperty({ description: 'Tempat lahir pasien', nullable: true })
  birthPlace: string | null;

  @ApiProperty({ description: 'Nama ibu kandung pasien', nullable: true })
  motherName: string | null;

  @ApiProperty({ description: 'Pekerjaan pasien', nullable: true })
  occupation: string | null;

  @ApiProperty({ description: 'Usia pasien dalam tahun' })
  age: number;

  @ApiProperty({ description: 'Golongan darah', example: 'o' })
  bloodType: string;

  @ApiProperty({
    description: 'Email pasien atau akun pengguna terkait',
    nullable: true,
  })
  email: string | null;

  @ApiProperty({
    description: 'Nomor telepon / WhatsApp',
    nullable: true,
  })
  phone: string | null;

  @ApiProperty({
    description: 'Alamat domisili lengkap',
    nullable: true,
  })
  fullAddress: string | null;

  @ApiProperty({
    enum: ['active', 'inactive', 'archived'],
    description: 'Status akun pasien',
  })
  status: string;

  @ApiProperty({ description: 'Apakah pasien ini adalah Akun Utama (Master)' })
  isMaster: boolean;

  @ApiProperty({ description: 'Apakah pasien memiliki akun login pengguna sendiri' })
  hasOwnAccount: boolean;

  @ApiProperty({ description: 'Jumlah pasien afiliasi di bawah akun ini' })
  affiliateCount: number;

  @ApiProperty({
    description: 'Tipe relasi keluarga jika pasien ini merupakan afiliasi',
    nullable: true,
    enum: ['self', 'parent', 'child', 'spouse', 'relative', 'friend', 'other'],
  })
  relationshipType?: string | null;

  @ApiProperty({
    description: 'Label relasi spesifik (misal: Anak, Ibu, Suami)',
    nullable: true,
  })
  relationLabel?: string | null;

  @ApiProperty({
    description: 'ID master patient jika pasien ini adalah afiliasi',
    nullable: true,
  })
  masterPatientId?: string | null;

  @ApiProperty({
    description: 'Nama master patient jika pasien ini adalah afiliasi',
    nullable: true,
  })
  masterPatientName?: string | null;

  @ApiProperty({
    description: 'Daftar pasien afiliasi turunan (anak ranting pohon tree)',
    type: [PatientDirectoryItemDto],
    required: false,
  })
  affiliates?: PatientDirectoryItemDto[];

  @ApiProperty({ description: 'Total seluruh janji temu yang pernah dibuat' })
  totalAppointments: number;

  @ApiProperty({ description: 'Total kunjungan yang berstatus selesai' })
  completedVisits: number;

  @ApiProperty({
    description: 'Total janji temu yang terlewat atau telat (no_show / late)',
  })
  missedAppointments: number;

  @ApiProperty({ description: 'Total janji temu yang dibatalkan' })
  cancelledAppointments: number;

  @ApiProperty({
    description: 'Tanggal janji temu atau kunjungan terakhir',
    nullable: true,
  })
  lastVisitDate: string | null;

  @ApiProperty({ description: 'Tanggal registrasi pasien di klinik' })
  registeredAt: string;
}

export class PatientDirectoryPaginationMetaDto {
  @ApiProperty({ description: 'Total jumlah data' })
  total: number;

  @ApiProperty({ description: 'Halaman saat ini' })
  page: number;

  @ApiProperty({ description: 'Batas data per halaman' })
  limit: number;

  @ApiProperty({ description: 'Total jumlah halaman' })
  totalPages: number;
}

export class PatientDirectorySummaryDto {
  @ApiProperty({ description: 'Total pasien terdaftar yang memenuhi kriteria' })
  totalPatients: number;

  @ApiProperty({ description: 'Akumulasi total seluruh janji temu' })
  totalAppointments: number;

  @ApiProperty({ description: 'Akumulasi total kunjungan selesai' })
  totalCompletedVisits: number;

  @ApiProperty({ description: 'Akumulasi total janji temu terlewat/batal' })
  totalMissedOrCancelled: number;
}

export class PatientDirectoryResponseDto {
  @ApiProperty({
    type: [PatientDirectoryItemDto],
    description: 'Daftar data pasien beragregat',
  })
  data: PatientDirectoryItemDto[];

  @ApiProperty({
    type: PatientDirectoryPaginationMetaDto,
    description: 'Metadata pagination',
  })
  meta: PatientDirectoryPaginationMetaDto;

  @ApiProperty({
    type: PatientDirectorySummaryDto,
    description: 'Ringkasan statistik direktori',
  })
  summary: PatientDirectorySummaryDto;
}

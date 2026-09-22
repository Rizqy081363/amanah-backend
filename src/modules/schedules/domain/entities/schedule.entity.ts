import { ApiProperty } from '@nestjs/swagger';

export class ScheduleEntity {
  id: string;
  staffId: string;
  staffName?: string;
  profession?: string;
  scheduleDate?: string;
  poliklinikId?: string | null;
  poliklinikName?: string | null;
  serviceId?: string | null;
  serviceName?: string | null;
  dayOfWeek?: number | null;
  specificDate?: string | null;
  session: 'PAGI' | 'SIANG' | 'MALAM';
  sessionLabel?: string;
  sessionShift?: 'morning' | 'afternoon' | 'night';
  startTime?: string | null;
  endTime?: string | null;
  timeRange?: string;
  roomId?: string | null;
  roomName?: string | null;
  capacity?: number;
  availableSlots?: number;
  bookedPatientCount?: number;
  status?: string;
  rawStatus?: string;
  isAvailable: boolean;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class DayScheduleSettingEntity {
  id?: string;
  practitionerId: string;
  scheduleDate: string;
  targetQuota: number;
  isCuti: boolean;
  cutiReason?: string | null;
  totalBookedPatients?: number;
  capacityPercentage?: number;
}

export class CalendarDaySummaryEntity {
  date: string;
  hasSchedule: boolean;
  isCuti: boolean;
  cutiReason: string | null;
  sessionCount: number;
  targetQuota: number;
  bookedPatientCount: number;
  capacityPercentage: number;
}

export class CalendarSummaryResponse {
  month: string;
  days: CalendarDaySummaryEntity[];
}

export class BookedPatientEntity {
  id: string;
  appointmentId: string;
  fullName: string;
  medicalRecordNumber: string;
  age: string;
  gender: string;
  queueNumber: string;
  timeSlot: string;
  sessionTitle: string;
  room: string;
  guardian: string | null;
  complaint: string | null;
  status: string;
  statusBadge: string;
  avatarUrl?: string | null;
}

export class ClinicRoomReferenceEntity {
  id: string;
  code: string;
  name: string;
  location?: string | null;
  floor?: string | null;
  isOccupied: boolean;
  occupiedBy?: string | null;
}

export class ScheduleOptionsReferenceEntity {
  shifts: {
    id: 'PAGI' | 'SIANG' | 'MALAM';
    label: string;
    shift: 'morning' | 'afternoon' | 'night';
    startTime: string;
    endTime: string;
  }[];
  statuses: {
    id: string;
    label: string;
  }[];
  timeSlotIntervals: number[];
}

export class AdminDoctorDailySession {
  @ApiProperty({ description: 'ID unik sesi shift' })
  id: string;

  @ApiProperty({ description: 'Nama label shift praktik' })
  nama_sesi: string;

  @ApiProperty({ description: 'Waktu mulai sesi (HH:mm)' })
  jam_mulai: string;

  @ApiProperty({ description: 'Waktu selesai sesi (HH:mm)' })
  jam_selesai: string;

  @ApiProperty({ description: 'Rentang jam waktu sesi' })
  waktu: string;

  @ApiProperty({ description: 'Kapasitas maksimal kuota pasien' })
  kuota_pasien: number;

  @ApiProperty({ description: 'Sisa kuota slot tersedia' })
  slot_tersedia: number;

  @ApiProperty({
    description: 'Status operasional sesi (Buka, Penuh, Tutup, Cuti)',
  })
  status_sesi: string;

  @ApiProperty({ description: 'Nama dan lokasi ruangan praktik' })
  ruang: string;
}

export class AdminDoctorScheduleCardEntity {
  @ApiProperty({ description: 'ID praktisi medis / dokter' })
  id: string;

  @ApiProperty({ description: 'ID praktisi' })
  practitioner_id: string;

  @ApiProperty({ description: 'Nama lengkap dokter beserta gelar' })
  nama_dokter: string;

  @ApiProperty({ description: 'Spesialisasi poli atau medis' })
  spesialisasi: string;

  @ApiProperty({
    description: 'Status praktik dokter saat ini (Buka, Penuh, Cuti, Tutup)',
  })
  status_dokter: string;

  @ApiProperty({
    description: 'Alamat email dokter',
    nullable: true,
    type: String,
    example: null,
  })
  email: string | null;

  @ApiProperty({
    description: 'Nomor telepon dokter',
    nullable: true,
    type: String,
    example: null,
  })
  nomor_telepon: string | null;

  @ApiProperty({ description: 'Nama ruangan praktik' })
  ruang_praktik: string;

  @ApiProperty({ description: 'Tanggal praktik terformat' })
  tanggal_praktik: string;

  @ApiProperty({
    description:
      'URL foto profil avatar dokter. Bernilai string kosong jika belum diunggah.',
    type: String,
    example: '',
  })
  avatar: string;

  @ApiProperty({ description: 'Sisa slot pasien tersedia' })
  slot_tersedia: number;

  @ApiProperty({ description: 'Total kapasitas kuota pasien per hari' })
  kapasitas_per_hari: number;

  @ApiProperty({ description: 'Rentang jam praktik hari ini' })
  jadwal_hari_ini: string;

  @ApiProperty({ description: 'Status operasional jadwal' })
  status_jadwal: string;

  @ApiProperty({ description: 'Bulan dan tahun jadwal' })
  bulan_jadwal: string;

  @ApiProperty({ description: 'Menandakan dokter sedang cuti' })
  is_cuti: boolean;

  @ApiProperty({
    description: 'Alasan cuti dokter',
    nullable: true,
    type: String,
    example: null,
  })
  cuti_reason: string | null;

  @ApiProperty({
    description: 'Tanggal mulai cuti',
    nullable: true,
    type: String,
    example: null,
  })
  cuti_start: string | null;

  @ApiProperty({
    description: 'Tanggal selesai cuti',
    nullable: true,
    type: String,
    example: null,
  })
  cuti_end: string | null;

  @ApiProperty({
    description: 'Daftar sesi shift praktik hari ini',
    type: () => [AdminDoctorDailySession],
  })
  sesi_harian: AdminDoctorDailySession[];
}

export class AdminDoctorScheduleListMeta {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 6 })
  limit: number;

  @ApiProperty({ example: 12 })
  total_doctors: number;

  @ApiProperty({ example: 2 })
  total_pages: number;
}

export class AdminDoctorScheduleListData {
  @ApiProperty({ type: () => [AdminDoctorScheduleCardEntity] })
  doctors: AdminDoctorScheduleCardEntity[];

  @ApiProperty({ type: () => AdminDoctorScheduleListMeta })
  meta: AdminDoctorScheduleListMeta;
}

export class AdminDoctorScheduleListResponse {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: () => AdminDoctorScheduleListData })
  data: AdminDoctorScheduleListData;
}

export class AdminDoctorMonthlyDayEntity {
  @ApiProperty({ example: 1 })
  day: number;

  @ApiProperty({ example: '2026-09-01' })
  date: string;

  @ApiProperty({ enum: ['Buka', 'Penuh', 'Cuti', 'Tutup'], example: 'Buka' })
  status: 'Buka' | 'Penuh' | 'Cuti' | 'Tutup';

  @ApiProperty({ nullable: true, type: String, example: null })
  notes: string | null;
}

export class AdminDoctorScheduleDetailData {
  @ApiProperty({ description: 'ID dokter' })
  id: string;

  @ApiProperty({ description: 'ID praktisi' })
  practitioner_id: string;

  @ApiProperty({ description: 'Nama dokter' })
  nama_dokter: string;

  @ApiProperty({ description: 'Spesialisasi' })
  spesialisasi: string;

  @ApiProperty({ description: 'Status praktik' })
  status_dokter: string;

  @ApiProperty({ nullable: true, type: String, example: null })
  email: string | null;

  @ApiProperty({ nullable: true, type: String, example: null })
  nomor_telepon: string | null;

  @ApiProperty({ description: 'Ruangan praktik' })
  ruang_praktik: string;

  @ApiProperty({
    description:
      'URL foto profil avatar dokter. Bernilai string kosong jika belum diunggah.',
    type: String,
    example: '',
  })
  avatar: string;

  @ApiProperty({ description: 'Slot tersedia' })
  slot_tersedia: number;

  @ApiProperty({ description: 'Kapasitas per hari' })
  kapasitas_per_hari: number;

  @ApiProperty({ description: 'Bulan jadwal' })
  bulan_jadwal: string;

  @ApiProperty({ description: 'Status cuti' })
  is_cuti: boolean;

  @ApiProperty({ nullable: true, type: String, example: null })
  cuti_reason: string | null;

  @ApiProperty({ nullable: true, type: String, example: null })
  cuti_start: string | null;

  @ApiProperty({ nullable: true, type: String, example: null })
  cuti_end: string | null;

  @ApiProperty({ type: () => [AdminDoctorMonthlyDayEntity] })
  monthly_schedule: AdminDoctorMonthlyDayEntity[];

  @ApiProperty({ type: () => [AdminDoctorDailySession] })
  sesi_harian: AdminDoctorDailySession[];
}

export class AdminDoctorScheduleDetailResponse {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: () => AdminDoctorScheduleDetailData })
  data: AdminDoctorScheduleDetailData;
}

export class ClinicalPractitionerEntity {
  id: string;
  name: string;
  spec: string;
  avatar: string;
  location: string;
  rating: string;
  tags: string[];
  schedule: string;
  is_available: boolean;
}

export class ClinicalPractitionersResponse {
  success: boolean;
  data: ClinicalPractitionerEntity[];
}

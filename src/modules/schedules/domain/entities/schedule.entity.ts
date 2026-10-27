import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CanonicalStaffShift } from '../constants/schedule-shift.constants';
import {
  STAFF_TYPES,
  type StaffType,
} from '../../../../common/constants/staff-types.constant';

export enum ScheduleOperationalStatus {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
  PENDING = 'PENDING',
  ON_LEAVE = 'ON_LEAVE',
}

export enum ScheduleClosureReason {
  CLINIC_CLOSED = 'CLINIC_CLOSED',
  NOT_ROSTERED = 'NOT_ROSTERED',
  DOCTOR_LEAVE = 'DOCTOR_LEAVE',
  ADMIN_OVERRIDE = 'ADMIN_OVERRIDE',
}

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
  session: CanonicalStaffShift;
  sessionLabel?: string;
  sessionShift?: CanonicalStaffShift | null;
  startTime?: string | null;
  endTime?: string | null;
  timeRange?: string;
  roomId?: string | null;
  roomName?: string | null;
  status?: string;
  rawStatus?: string;
  isAvailable: boolean;
  isPast?: boolean;
  statusBadge?: string;
  badgeVariant?: string;
  effectiveStatus?: string;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
  doctorId?: string;
  practitionerId?: string;
  isRescheduleEligible?: boolean;
  rescheduleIneligibilityReason?: string | null;
  sessionId?: string | null;
  version?: string;
}

export class CalendarDaySummaryEntity {
  date: string;
  hasSchedule: boolean;
  isOnLeave: boolean;
  leaveReason: string | null;
  sessionCount: number;
  bookedPatientCount: number;
  status?: ScheduleOperationalStatus;
  isClosed?: boolean;
  notes?: string | null;
}

export class CalendarSummaryResponse {
  month: string;
  days: CalendarDaySummaryEntity[];
}

export class BookedPatientEntity {
  id: string;
  appointmentId: string;
  patientId?: string;
  fullName: string;
  medicalRecordNumber: string;
  age: string;
  gender: string;
  queueNumber: string;
  etaRange?: string | null;
  estimatedStartAt?: Date | string | null;
  estimatedEndAt?: Date | string | null;
  sessionTitle: string;
  room: string;
  guardian: string | null;
  complaint: string | null;
  status: string;
  statusBadge: string;
  avatarUrl?: string | null;
  actualStartedAt?: Date | string | null;
  actualCompletedAt?: Date | string | null;
  consultationElapsedSeconds?: number | null;
  consultationDurationFormatted?: string | null;
}

export class ClinicRoomReferenceEntity {
  id: string;
  code: string;
  name: string;
  location?: string | null;
  floor?: string | null;
  isOccupied: boolean;
  occupiedBy?: string | null;
  occupantDetails?: {
    practitionerId?: string;
    staffProfileId?: string | null;
    practitionerName: string;
    specialty?: string;
    unitName?: string | null;
    startTime: string;
    endTime: string;
    roomName: string;
  } | null;
}

export class ScheduleOptionsReferenceEntity {
  shifts: {
    id: 'DINI_HARI' | 'PAGI' | 'SIANG' | 'MALAM' | string;
    label: string;
    shift: 'early_morning' | 'morning' | 'afternoon' | 'night' | string;
    startTime: string;
    endTime: string;
    timeRange?: string;
    startHour?: number;
    endHour?: number;
    durationMinutes?: number;
    precisionMinutes?: number;
  }[];
  statuses: {
    id: string;
    label: string;
  }[];
  durationIntervals?: number[];
  effectiveConsultationDurationMinutes?: number;
  durationSource?: string;
  durationScope?: string;
  canonicalIntervalStatuses?: {
    id: 'OPEN' | 'CLOSED';
    label: string;
  }[];
}

export class ScheduleContextEntity {
  contextId: string;
  contextLabel: string;
  sessionShift: 'early_morning' | 'morning' | 'afternoon' | 'night';
  date: string;
  practitionerId: string;
  boundaryStartTime: string;
  boundaryEndTime: string;
  allowedStartPrecisionMinutes: number;
  timezone: string;
  effectiveConsultationDurationMinutes: number;
  durationSource: 'PRACTITIONER_CONFIG';
  durationScope: 'practitioner-specific';
  durationEditableByCurrentUser: boolean;
}

export class ScheduleIntervalAppointmentRefEntity {
  appointmentId: string;
  queueNumber: string | null;
  status: string | null;
}

export class ScheduleProjectedIntervalEntity {
  intervalId: string;
  intervalIndex: number;
  startTime: string;
  endTime: string;
  status: 'OPEN' | 'CLOSED';
  displayLabel: 'Buka' | 'Tutup';
  appointmentRef?: ScheduleIntervalAppointmentRefEntity;
  closedReason?: 'LEAVE' | 'SCHEDULE_CLOSED' | 'OUTSIDE_BOUNDARY';
  isSelectable?: boolean;
  timeRange?: string;
  timeStart?: string;
  timeEnd?: string;
  uiLabel?: string;
  uiSubLabel?: string;
  isClickable?: boolean;
  actionType?: 'NONE' | 'ADD_SESSION' | 'VIEW_SESSION' | 'VIEW_PATIENTS';
  sessionId?: string | null;
  patientInfo?: any | null;
  rescheduleInfo?: any | null;
  closureInfo?: any | null;
  closure?: any;
  appointment?: any;
  reschedule?: any;
}

export class ScheduleShiftBoundaryEntity {
  startTime: string;
  endTime: string;
}

export class ScheduleProjectionEntity {
  scheduleId?: string;
  practitionerId: string;
  date: string;
  scheduleContextId: string;
  contextLabel: string;
  selectedStartTime: string;
  boundaryStartTime: string;
  boundaryEndTime: string;
  shiftBoundary?: ScheduleShiftBoundaryEntity;
  projectedEndTime: string;
  effectiveConsultationDurationMinutes: number;
  durationSource: 'PRACTITIONER_CONFIG';
  durationScope: 'practitioner-specific';
  durationEditableByCurrentUser: boolean;
  allowedStartPrecisionMinutes: number;
  timezone: string;
  nominalCapacity?: number;
  capacity?: number;
  isClosed?: boolean;
  closedReason?: string;
  intervals?: ScheduleProjectedIntervalEntity[];
  version?: string;
  updatedAt?: string | null;
}

export class AdminDoctorDailySession {
  @ApiProperty({ description: 'ID unik sesi shift' })
  id: string;

  @ApiProperty({ description: 'Nama label shift praktik' })
  sessionName: string;

  @ApiProperty({ description: 'Waktu mulai sesi (HH:mm)' })
  startTime: string;

  @ApiProperty({ description: 'Waktu selesai sesi (HH:mm)' })
  endTime: string;

  @ApiPropertyOptional({ description: 'Rentang jam waktu sesi' })
  timeRange?: string;

  @ApiProperty({
    description:
      'Jumlah pasien terdaftar pada sesi ini (dihitung riil dari appointment aktif oleh backend)',
    example: 0,
  })
  bookedPatients: number;

  @ApiProperty({
    description: 'Canonical effective session status',
    enum: ScheduleOperationalStatus,
    example: 'OPEN',
  })
  sessionStatus: ScheduleOperationalStatus;

  @ApiProperty({
    description: 'Closure reason code if sessionStatus is CLOSED',
    enum: ScheduleClosureReason,
    nullable: true,
    required: false,
    example: null,
  })
  closureReason?: ScheduleClosureReason | null;

  @ApiProperty({ description: 'Nama dan lokasi ruangan praktik' })
  roomName: string;

  @ApiProperty({
    description: 'ID ruangan praktik',
    nullable: true,
    required: false,
    example: null,
  })
  roomId?: string | null;

  @ApiProperty({
    description: 'Flag apakah sesi ini memenuhi syarat untuk di-reschedule',
    example: true,
  })
  isRescheduleEligible: boolean;

  @ApiProperty({
    description:
      'Alasan penolakan reschedule jika isRescheduleEligible bernilai false',
    nullable: true,
    example: null,
  })
  rescheduleIneligibilityReason?: string | null;

  @ApiPropertyOptional({
    description: 'Tanggal kalender spesifik untuk sesi ini (YYYY-MM-DD)',
    example: '2026-10-10',
  })
  date?: string;
}

export class AdminDoctorCardPatientPreviewItem {
  @ApiProperty({ description: 'ID janji temu' })
  id: string;

  @ApiProperty({ description: 'ID profil pasien' })
  patientId: string;

  @ApiProperty({ description: 'Nama lengkap pasien' })
  name: string;

  @ApiProperty({ description: 'Inisial 2 huruf pasien (standar klinis)' })
  initials: string;

  @ApiProperty({
    description: 'URL foto profil avatar pasien jika ada',
    nullable: true,
    type: String,
    example: null,
  })
  avatarUrl: string | null;
}

export class AdminDoctorScheduleCardEntity {
  @ApiProperty({ description: 'ID praktisi medis / dokter' })
  id: string;

  @ApiProperty({ description: 'ID praktisi' })
  practitionerId: string;

  @ApiPropertyOptional({ description: 'ID profil staf dokter / bidan' })
  staffProfileId?: string | null;

  @ApiPropertyOptional({ description: 'ID staf' })
  staffId?: string | null;

  @ApiPropertyOptional({ description: 'Kode unik staf (contoh: STF-DOK-3841)' })
  staffCode?: string | null;

  @ApiPropertyOptional({
    description: 'Tipe staf klinis (doctor, midwife, worker)',
    enum: Object.values(STAFF_TYPES),
    example: STAFF_TYPES.DOCTOR,
  })
  staffType?: StaffType;

  @ApiProperty({ description: 'Nama lengkap dokter beserta gelar' })
  fullName: string;

  @ApiProperty({ description: 'Spesialisasi poli atau medis' })
  specialty: string;

  @ApiProperty({
    description: 'Canonical effective doctor schedule status',
    enum: ScheduleOperationalStatus,
    example: 'OPEN',
  })
  doctorStatus: ScheduleOperationalStatus;

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
  phone: string | null;

  @ApiProperty({ description: 'Nama ruangan praktik' })
  practiceRoom: string;

  @ApiPropertyOptional({ description: 'Tanggal praktik (YYYY-MM-DD)' })
  practiceDate?: string;

  @ApiProperty({
    description:
      'URL foto profil avatar dokter. Bernilai string kosong jika belum diunggah.',
    type: String,
    example: '',
  })
  avatar: string;

  @ApiProperty({ description: 'Rentang jam praktik hari ini' })
  todaySchedule: string;

  @ApiProperty({
    description:
      'Jadwal praktik mendatang yang dievaluasi dinamis dari waktu saat ini',
    example: 'Sesi Pagi (08:00 - 11:30)',
  })
  upcomingSchedule: string;

  @ApiProperty({
    description: 'Canonical effective schedule status',
    enum: ScheduleOperationalStatus,
    example: 'OPEN',
  })
  scheduleStatus: ScheduleOperationalStatus;

  @ApiPropertyOptional({ description: 'Bulan dan tahun jadwal (YYYY-MM)' })
  scheduleMonth?: string;

  @ApiProperty({ description: 'Menandakan dokter sedang cuti' })
  isOnLeave: boolean;

  @ApiProperty({
    description: 'Alasan cuti dokter',
    nullable: true,
    type: String,
    example: null,
  })
  leaveReason: string | null;

  @ApiProperty({
    description: 'Tanggal mulai cuti',
    nullable: true,
    type: String,
    example: null,
  })
  leaveStart: string | null;

  @ApiProperty({
    description: 'Tanggal selesai cuti',
    nullable: true,
    type: String,
    example: null,
  })
  leaveEnd: string | null;

  @ApiPropertyOptional({
    description: 'Jenis cuti dokter',
    nullable: true,
    type: String,
    example: 'annual_leave',
  })
  leaveType?: string | null;

  @ApiPropertyOptional({
    description: 'Nama dokter pengganti jika jadwal cuti telah digantikan',
    nullable: true,
    type: String,
    example: 'dr. Budi Santoso',
  })
  substituteDoctorName?: string | null;

  @ApiPropertyOptional({
    description: 'Status peluang pengganti (open, claimed, completed)',
    nullable: true,
    type: String,
    example: 'claimed',
  })
  replacementStatus?: string | null;

  @ApiProperty({
    description: 'Daftar sesi shift praktik hari ini',
    type: () => [AdminDoctorDailySession],
  })
  dailySessions: AdminDoctorDailySession[];

  @ApiProperty({
    description: 'Total pasien terdaftar pada tanggal aktif',
    example: 5,
  })
  totalPatients: number;

  @ApiProperty({
    description:
      'Daftar ringkas avatar pasien terdaftar untuk kartu dokter (maks 4)',
    type: () => [AdminDoctorCardPatientPreviewItem],
  })
  patientPreviews: AdminDoctorCardPatientPreviewItem[];

  @ApiPropertyOptional({
    description:
      'Menandakan apakah dokter sudah diverifikasi dan menerima janji temu (false saat masih menunggu verifikasi undangan)',
    type: Boolean,
    example: true,
  })
  isAcceptingAppointments?: boolean;
}

export class AdminDoctorScheduleListMeta {
  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 6 })
  limit: number;

  @ApiProperty({ example: 12 })
  totalDoctors: number;

  @ApiProperty({ example: 2 })
  totalPages: number;
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

  @ApiProperty({ enum: ScheduleOperationalStatus, example: 'OPEN' })
  status: ScheduleOperationalStatus;

  @ApiProperty({ nullable: true, type: String, example: null })
  notes: string | null;

  @ApiProperty({
    enum: ['OPEN', 'CLOSED', 'LEAVE', 'EMPTY'],
    example: 'OPEN',
    required: false,
  })
  dayStatus?: 'OPEN' | 'CLOSED' | 'LEAVE' | 'EMPTY';

  @ApiProperty({ example: 'Buka', required: false })
  statusLabel?: string;

  @ApiProperty({
    enum: ['success', 'danger', 'warning', 'neutral'],
    example: 'success',
    required: false,
  })
  badgeVariant?: 'success' | 'danger' | 'warning' | 'neutral';

  @ApiProperty({ example: 2, required: false })
  activeSessions?: number;

  @ApiProperty({ example: 0, required: false })
  bookedPatients?: number;

  @ApiProperty({ example: true, required: false })
  isClickable?: boolean;
}

export class AdminDoctorScheduleDetailData {
  @ApiProperty({ description: 'ID dokter' })
  id: string;

  @ApiProperty({ description: 'ID praktisi' })
  practitionerId: string;

  @ApiPropertyOptional({ description: 'ID profil staf dokter / bidan' })
  staffProfileId?: string | null;

  @ApiPropertyOptional({ description: 'ID staf' })
  staffId?: string | null;

  @ApiPropertyOptional({ description: 'Kode unik staf (contoh: STF-DOK-3841)' })
  staffCode?: string | null;

  @ApiPropertyOptional({
    description: 'Tipe staf klinis (doctor, midwife, worker)',
    enum: Object.values(STAFF_TYPES),
    example: STAFF_TYPES.DOCTOR,
  })
  staffType?: StaffType;

  @ApiProperty({ description: 'Nama dokter' })
  fullName: string;

  @ApiProperty({ description: 'Spesialisasi' })
  specialty: string;

  @ApiProperty({
    description: 'Canonical effective doctor schedule status',
    enum: ScheduleOperationalStatus,
    example: 'OPEN',
  })
  doctorStatus: ScheduleOperationalStatus;

  @ApiProperty({
    description: 'Whether doctor is accepting appointments/verified',
    required: false,
    example: true,
  })
  isAcceptingAppointments?: boolean;

  @ApiProperty({ nullable: true, type: String, example: null })
  email: string | null;

  @ApiProperty({ nullable: true, type: String, example: null })
  phone: string | null;

  @ApiProperty({ description: 'Ruangan praktik' })
  practiceRoom: string;

  @ApiProperty({
    description:
      'URL foto profil avatar dokter. Bernilai string kosong jika belum diunggah.',
    type: String,
    example: '',
  })
  avatar: string;

  @ApiPropertyOptional({ description: 'Bulan jadwal (YYYY-MM)' })
  scheduleMonth?: string;

  @ApiProperty({ description: 'Status cuti' })
  isOnLeave: boolean;

  @ApiProperty({ nullable: true, type: String, example: null })
  leaveReason: string | null;

  @ApiProperty({ nullable: true, type: String, example: null })
  leaveStart: string | null;

  @ApiProperty({ nullable: true, type: String, example: null })
  leaveEnd: string | null;

  @ApiPropertyOptional({
    description: 'Jenis cuti dokter',
    nullable: true,
    type: String,
    example: 'annual_leave',
  })
  leaveType?: string | null;

  @ApiPropertyOptional({
    description: 'Nama dokter pengganti jika jadwal cuti telah digantikan',
    nullable: true,
    type: String,
    example: 'dr. Budi Santoso',
  })
  substituteDoctorName?: string | null;

  @ApiPropertyOptional({
    description: 'Status peluang pengganti (open, claimed, completed)',
    nullable: true,
    type: String,
    example: 'claimed',
  })
  replacementStatus?: string | null;

  @ApiProperty({ type: () => [AdminDoctorMonthlyDayEntity] })
  monthlySchedule: AdminDoctorMonthlyDayEntity[];

  @ApiProperty({ type: () => [AdminDoctorDailySession] })
  dailySessions: AdminDoctorDailySession[];

  @ApiPropertyOptional({
    description:
      'Interval backend-projected untuk timeline/Gantt admin detail sheet',
    type: () => [ScheduleProjectedIntervalEntity],
  })
  timelineIntervals?: ScheduleProjectedIntervalEntity[];

  @ApiPropertyOptional({
    description:
      '4-shift 24-hour cycle projections with multi-dimensional states and counts',
  })
  shifts?: any[];

  @ApiPropertyOptional({
    description: 'Context projections with multi-dimensional states and counts',
  })
  contextProjections?: any[];

  @ApiPropertyOptional({
    description: 'Whole-day aggregated projection metrics and dual indicators',
  })
  metrics?: any;

  @ApiPropertyOptional({
    description: 'Whole-day aggregated projection metrics and dual indicators',
  })
  summary?: any;
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
  is_on_leave?: boolean;
  leave_reason?: string | null;
  is_replacement?: boolean;
  replacing_practitioner_name?: string | null;
  attendance_status?: 'checked_in' | 'not_checked_in' | 'late' | 'on_leave' | 'absent';
  check_in_at?: string | null;
  attendance_warning?: string | null;
}

export class ScheduleShiftCapacityEntity {
  @ApiProperty({ example: 'early_morning' })
  contextId: string;

  @ApiProperty({ example: 'Dini Hari' })
  contextLabel: string;

  @ApiProperty({
    enum: ['early_morning', 'morning', 'afternoon', 'night'],
    example: 'early_morning',
  })
  sessionShift: 'early_morning' | 'morning' | 'afternoon' | 'night';

  @ApiProperty({ example: '00:00 - 06:00 WIB' })
  timeRange: string;

  @ApiProperty({ example: '00:00' })
  boundaryStartTime: string;

  @ApiProperty({ example: '06:00' })
  boundaryEndTime: string;

  @ApiProperty({ example: 2, required: false })
  laneCapacity?: number;

  @ApiProperty({ example: 5, required: false })
  activeTickets?: number;

  @ApiProperty({ example: 12, required: false })
  nominalCapacity?: number;

  @ApiProperty({ example: 'Lancar', required: false })
  loadStatus?: string;

  @ApiProperty({ example: 0.42, required: false })
  loadRatio?: number;
}

export class ScheduleCapacitySummaryEntity {
  @ApiProperty({ example: 4 })
  totalShifts: number;

  @ApiProperty({ example: 5, required: false })
  totalActiveTickets?: number;

  @ApiProperty({ example: 48, required: false })
  totalNominalCapacity?: number;

  @ApiProperty({ example: 0.1, required: false })
  overallLoadRatio?: number;
}

export class ScheduleCapacityOverviewData {
  @ApiProperty({ example: '2026-09-25' })
  date: string;

  @ApiProperty({ example: '3cb62e10-450b-43e5-aba9-49ec37079ebb' })
  practitionerId: string;

  @ApiProperty({ example: 'dr. Ahmad Santoso' })
  practitionerName: string;

  @ApiProperty({ example: 30 })
  effectiveConsultationDurationMinutes: number;

  @ApiProperty({
    nullable: true,
    example: 'e3067341-a185-484d-91d6-84848fcff1ef',
  })
  roomId?: string | null;

  @ApiProperty({ nullable: true, example: 'Ruang Poli 1' })
  roomName?: string | null;

  @ApiProperty({ example: false })
  isOnLeave: boolean;

  @ApiProperty({ nullable: true, example: null })
  leaveReason?: string | null;

  @ApiProperty({ type: () => ScheduleCapacitySummaryEntity })
  summary: ScheduleCapacitySummaryEntity;

  @ApiProperty({ type: () => [ScheduleShiftCapacityEntity] })
  shifts: ScheduleShiftCapacityEntity[];
}

export class ScheduleCapacityOverviewResponse {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: () => ScheduleCapacityOverviewData })
  data: ScheduleCapacityOverviewData;
}

export class RescheduleSourceSessionInfo {
  @ApiProperty({ example: '8489be4c-7c05-4c07-b352-7bf579b29cb1' })
  id: string;

  @ApiProperty({ example: '2026-09-24' })
  scheduleDate: string;

  @ApiProperty({ example: '02:00' })
  startTime: string;

  @ApiProperty({ example: '02:30' })
  endTime: string;

  @ApiProperty({ example: '02:00 - 02:30 WIB' })
  timeRange: string;

  @ApiProperty({ example: 'open' })
  status: string;

  @ApiProperty({ enum: ScheduleOperationalStatus, example: 'OPEN' })
  statusLabel: ScheduleOperationalStatus;

  @ApiProperty({ example: 'Dini Hari' })
  sessionLabel: string;

  @ApiProperty({ example: 'early_morning' })
  sessionShift: string;

  @ApiProperty({ example: 'Ruang Poli 1' })
  roomName: string;

  @ApiProperty({ example: 1 })
  activeAppointmentsCount: number;

  @ApiProperty({ example: true })
  isSourceEligible: boolean;

  @ApiProperty({ nullable: true, example: null })
  rejectionReason?: string | null;
}

export class RescheduleTargetValidationInfo {
  @ApiProperty({ example: true })
  evaluated: boolean;

  @ApiProperty({ nullable: true, example: '2026-10-15' })
  targetDate?: string | null;

  @ApiProperty({ nullable: true, example: '09:00' })
  targetStartTime?: string | null;

  @ApiProperty({ nullable: true, example: '09:30' })
  projectedEndTime?: string | null;

  @ApiProperty({
    nullable: true,
    example: 'e3067341-a185-484d-91d6-84848fcff1ef',
  })
  targetRoomId?: string | null;

  @ApiProperty({ nullable: true, example: 'Ruang Poli 1' })
  targetRoomName?: string | null;

  @ApiProperty({ example: true })
  isTargetEligible: boolean;

  @ApiProperty({ nullable: true, example: null })
  conflictCode?: string | null;

  @ApiProperty({ nullable: true, example: null })
  conflictMessage?: string | null;

  @ApiProperty({ nullable: true, example: null })
  conflictMetadata?: Record<string, any> | null;
}

export class RescheduleEligibilityEntity {
  @ApiProperty({ example: '8489be4c-7c05-4c07-b352-7bf579b29cb1' })
  sessionId: string;

  @ApiProperty({ example: '3cb62e10-450b-43e5-aba9-49ec37079ebb' })
  practitionerId: string;

  @ApiProperty({ example: 'dr. Ahmad Santoso' })
  practitionerName: string;

  @ApiProperty({ example: true })
  isEligible: boolean;

  @ApiProperty({ type: () => RescheduleSourceSessionInfo })
  sourceSession: RescheduleSourceSessionInfo;

  @ApiProperty({ type: () => RescheduleTargetValidationInfo })
  targetValidation: RescheduleTargetValidationInfo;

  @ApiProperty({ example: 'Sesi memenuhi syarat untuk di-reschedule.' })
  actionableGuidance: string;
}

export class RescheduleEligibilityResponse {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: () => RescheduleEligibilityEntity })
  data: RescheduleEligibilityEntity;
}

export class AdminPatientDemographicEntity {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  id: string;

  @ApiProperty({ example: 'Ahmad Dahlan' })
  fullName: string;

  @ApiProperty({ example: 'RM-2026-00891' })
  medicalRecordNumber: string;

  @ApiProperty({ example: '3201234567890001' })
  nik: string;

  @ApiProperty({ example: 'Laki-laki' })
  gender: string;

  @ApiProperty({ example: '1994-05-14' })
  birthDate: string;

  @ApiPropertyOptional({ example: '32 Thn' })
  age?: string;

  @ApiProperty({ nullable: true, example: '081234567890' })
  phoneNumber: string | null;

  @ApiProperty({ nullable: true, example: 'ahmad.dahlan@example.com' })
  email: string | null;

  @ApiProperty({
    nullable: true,
    example: 'Jl. Merdeka No. 45, RT 02/RW 05, Kel. Cibinong, Kab. Bogor',
  })
  address: string | null;

  @ApiProperty({ nullable: true, example: 'Siti Aminah (Istri)' })
  guardianName: string | null;

  @ApiProperty({ nullable: true, example: null })
  avatarUrl: string | null;
}

export class AdminAppointmentBookingMetadata {
  @ApiProperty({ nullable: true, example: '2026-09-23T14:20:00.000Z' })
  bookedAt: string | null;

  @ApiProperty({ nullable: true, example: '2026-09-24T07:45:00.000Z' })
  checkedInAt: string | null;

  @ApiProperty({ nullable: true, example: null })
  startedAt: string | null;

  @ApiProperty({ nullable: true, example: null })
  completedAt: string | null;

  @ApiProperty({ nullable: true, example: null })
  cancelledAt: string | null;

  @ApiProperty({ nullable: true, example: null })
  cancelReason: string | null;
}

export class AdminSessionPatientItem {
  @ApiProperty({ example: '6d3a26e2-77fb-466d-9096-d3b2400c443d' })
  appointmentId: string;

  @ApiPropertyOptional({ example: '6d3a26e2-77fb-466d-9096-d3b2400c443d' })
  id?: string;

  @ApiProperty({ example: '2026-10-04' })
  appointmentDate: string;

  @ApiProperty({
    nullable: true,
    example: '9fa87102-4412-4211-91a1-872f2aa56e99',
  })
  queueTicketId: string | null;

  @ApiProperty({ example: 'P-001' })
  queueNumber: string;

  @ApiProperty({ nullable: true, example: '08:20 - 08:40 WIB' })
  etaRange?: string | null;

  @ApiProperty({ nullable: true, example: '2026-10-12T01:20:00.000Z' })
  estimatedStartAt?: string | null;

  @ApiProperty({ nullable: true, example: '2026-10-12T01:40:00.000Z' })
  estimatedEndAt?: string | null;

  @ApiProperty({
    enum: [
      'waiting',
      'in_service',
      'completed',
      'cancelled',
      'no_show',
      'booked',
    ],
    example: 'waiting',
  })
  status: string;

  @ApiPropertyOptional({ example: 'Menunggu' })
  statusBadge?: string;

  @ApiProperty({
    nullable: true,
    example: 'Demam tinggi 3 hari dan batuk berdahak',
  })
  chiefComplaint: string | null;

  @ApiPropertyOptional({ example: 'Ruang Poli Umum 1' })
  clinicRoomName?: string;

  @ApiProperty({ nullable: true, example: 'Ruang Poli Umum 1' })
  roomName: string | null;

  @ApiProperty({ nullable: true, example: 'Gedung Utama' })
  roomLocation: string | null;

  @ApiProperty({ nullable: true, example: 'Poli Umum' })
  poliklinikName: string | null;

  @ApiProperty({ example: 'Pemeriksaan Baru' })
  visitType: string;

  @ApiProperty({ nullable: true, example: 'Pemeriksaan Umum' })
  serviceName: string | null;

  @ApiProperty({ example: true })
  isCancellable: boolean;

  @ApiProperty({ type: () => AdminPatientDemographicEntity })
  patient: AdminPatientDemographicEntity;

  @ApiProperty({ type: () => AdminAppointmentBookingMetadata })
  bookingMetadata: AdminAppointmentBookingMetadata;

  @ApiPropertyOptional({ nullable: true, example: 'Sesi Pagi' })
  sessionTitle?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 30 })
  estimatedDurationMinutes?: number | null;

  @ApiPropertyOptional({ nullable: true, example: '30 Menit' })
  consultationDurationFormatted?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 900 })
  consultationElapsedSeconds?: number | null;

  @ApiPropertyOptional({
    type: [String],
    example: ['CALL', 'START_SERVICE', 'CANCEL', 'RESCHEDULE'],
    description: 'Aksi yang diizinkan sesuai status janji temu dan konteks dokter',
  })
  allowedActions?: string[];
}

export class AdminSessionPatientsClinicRoom {
  @ApiProperty({ example: 'e4b2d189-9a71-46f9-8d77-628a8d11e5a1' })
  id: string;

  @ApiProperty({ example: 'Ruang Poli Umum 1' })
  name: string;

  @ApiProperty({ nullable: true, example: 'Lantai 1' })
  floor?: string | null;
}

export class AdminSessionPatientsData {
  @ApiProperty({ example: '8489be4c-7c05-4c07-b352-7bf579b29cb1' })
  sessionId: string;

  @ApiProperty({ example: 'Pagi' })
  sessionLabel: string;

  @ApiProperty({ example: 'Pagi' })
  shift: string;

  @ApiProperty({ example: '2026-09-24' })
  scheduleDate: string;

  @ApiProperty({ example: '08:00' })
  startTime: string;

  @ApiProperty({ example: '11:30' })
  endTime: string;

  @ApiProperty({ example: 8 })
  bookedCount: number;

  @ApiProperty({ nullable: true, type: () => AdminSessionPatientsClinicRoom })
  clinicRoom: AdminSessionPatientsClinicRoom | null;

  @ApiProperty({ type: () => [AdminSessionPatientItem] })
  patients: AdminSessionPatientItem[];
}

export class AdminSessionPatientsResponse {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: () => AdminSessionPatientsData })
  data: AdminSessionPatientsData;
}

export class AdminDoctorAccumulatedSessionItem {
  @ApiProperty({ example: '8489be4c-7c05-4c07-b352-7bf579b29cb1' })
  sessionId: string;

  @ApiProperty({ example: 'Pagi' })
  sessionLabel: string;

  @ApiProperty({ example: 'Pagi' })
  shift: string;

  @ApiProperty({ example: '08:00' })
  startTime: string;

  @ApiProperty({ example: '11:30' })
  endTime: string;

  @ApiProperty({ example: 8 })
  bookedCount: number;

  @ApiProperty({ type: () => [AdminSessionPatientItem] })
  patients: AdminSessionPatientItem[];
}

export class AdminDoctorAccumulatedPatientsData {
  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  doctorId: string;

  @ApiProperty({ example: 'dr. H. Muhammad Fadhil, Sp.PD' })
  doctorName: string;

  @ApiProperty({ example: '2026-09-24' })
  date: string;

  @ApiProperty({ example: 18 })
  accumulatedBookedCount: number;

  @ApiProperty({ type: () => [AdminDoctorAccumulatedSessionItem] })
  sessions: AdminDoctorAccumulatedSessionItem[];

  @ApiProperty({ type: () => [AdminSessionPatientItem] })
  patients: AdminSessionPatientItem[];
}

export class AdminDoctorAccumulatedPatientsResponse {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: () => AdminDoctorAccumulatedPatientsData })
  data: AdminDoctorAccumulatedPatientsData;
}

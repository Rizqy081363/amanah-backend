import { ApiProperty } from '@nestjs/swagger';

export enum ScheduleOperationalStatus {
  OPEN = 'OPEN',
  OCCUPIED = 'OCCUPIED',
  CLOSED = 'CLOSED',
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
  session: 'DINI_HARI' | 'PAGI' | 'SIANG' | 'MALAM';
  sessionLabel?: string;
  sessionShift?: 'early_morning' | 'morning' | 'afternoon' | 'night' | null;
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
  is_reschedule_eligible?: boolean;
  rescheduleIneligibilityReason?: string | null;
  reschedule_ineligibility_reason?: string | null;
  version?: string;
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
    totalSlots?: number;
    durationMinutes?: number;
    precisionMinutes?: number;
  }[];
  statuses: {
    id: string;
    label: string;
  }[];
  timeSlotIntervals: number[];
  effectiveConsultationDurationMinutes?: number;
  durationSource?: string;
  durationScope?: string;
  canonicalIntervalStatuses?: {
    id: 'OPEN' | 'OCCUPIED' | 'CLOSED';
    label: string;
  }[];
  slotStatuses?: {
    id: string;
    label: string;
  }[];
  slotConflictTypes?: {
    id: string;
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
  status: 'OPEN' | 'OCCUPIED' | 'CLOSED';
  displayLabel: 'Buka' | 'Terisi' | 'Tutup';
  isOccupied: boolean;
  appointmentRef?: ScheduleIntervalAppointmentRefEntity;
  closedReason?: 'LEAVE' | 'SCHEDULE_CLOSED' | 'OUTSIDE_BOUNDARY';
  temporalState?: 'PAST' | 'CURRENT' | 'FUTURE';
  availabilityState?: 'UNSCHEDULED' | 'AVAILABLE' | 'OCCUPIED' | 'CLOSED';
  effectiveStatus?:
    | 'EXPIRED'
    | 'CLOSED'
    | 'OCCUPIED'
    | 'AVAILABLE'
    | 'UNSCHEDULED';
  isSelectable?: boolean;
  timeRange?: string;
  slotId?: string;
  timeStart?: string;
  timeEnd?: string;
  uiStatus?:
    | 'UNSCHEDULED_PAST'
    | 'UNSCHEDULED'
    | 'COMPLETED'
    | 'AVAILABLE'
    | 'OCCUPIED'
    | 'CLOSED_LEAVE'
    | 'CLOSED_CLINIC';
  uiLabel?: string;
  uiSubLabel?: string;
  uiVariant?:
    | 'neutral_disabled'
    | 'dashed_border'
    | 'muted_gray'
    | 'success_green'
    | 'info_blue'
    | 'sky_badge'
    | 'danger_red';
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
  capacity: number;
  remainingShiftSlots?: number;
  intervals: ScheduleProjectedIntervalEntity[];
  version?: string;
  updatedAt?: string | null;
}

export class ScheduleAvailabilityMutationResponse {
  schedule: ScheduleEntity;
  projection: ScheduleProjectionEntity;
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
    description:
      'Jumlah pasien terdaftar pada sesi ini (dihitung riil dari appointment aktif oleh backend)',
    example: 0,
  })
  pasien_terdaftar: number;

  @ApiProperty({
    description:
      'Format display slot pasien terdaftar terhadap kuota sesi (misal: "0 / 10")',
    example: '0 / 10',
  })
  display_slot: string;

  @ApiProperty({
    description: 'Canonical effective session status',
    enum: ScheduleOperationalStatus,
    example: 'OPEN',
  })
  status_sesi: ScheduleOperationalStatus;

  @ApiProperty({ description: 'Nama dan lokasi ruangan praktik' })
  ruang: string;

  @ApiProperty({
    description: 'Flag apakah sesi ini memenuhi syarat untuk di-reschedule',
    example: true,
  })
  is_reschedule_eligible: boolean;

  @ApiProperty({
    description:
      'Alasan penolakan reschedule jika is_reschedule_eligible bernilai false',
    nullable: true,
    example: null,
  })
  reschedule_ineligibility_reason?: string | null;
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
    description: 'Canonical effective doctor schedule status',
    enum: ScheduleOperationalStatus,
    example: 'OPEN',
  })
  status_dokter: ScheduleOperationalStatus;

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

  @ApiProperty({
    description:
      'Jadwal praktik mendatang yang dievaluasi dinamis dari waktu saat ini',
    example: 'Sesi Pagi (08:00 - 11:30)',
  })
  jadwal_praktik_mendatang: string;

  @ApiProperty({
    description: 'Akumulasi total slot terisi pada hari tersebut',
    example: 8,
  })
  slot_terisi_akumulasi: number;

  @ApiProperty({
    description:
      'Akumulasi total kapasitas kuota pasien seluruh sesi pada hari tersebut',
    example: 24,
  })
  slot_kapasitas_akumulasi: number;

  @ApiProperty({
    description:
      'Format display slot akumulasi terisi terhadap total kapasitas (X / Y)',
    example: '8 / 24',
  })
  display_akumulasi_slot: string;

  @ApiProperty({
    description: 'Canonical effective schedule status',
    enum: ScheduleOperationalStatus,
    example: 'OPEN',
  })
  status_jadwal: ScheduleOperationalStatus;

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

  @ApiProperty({ enum: ScheduleOperationalStatus, example: 'OPEN' })
  status: ScheduleOperationalStatus;

  @ApiProperty({ nullable: true, type: String, example: null })
  notes: string | null;

  @ApiProperty({
    enum: ['OPEN', 'CLOSED', 'CUTI', 'EMPTY'],
    example: 'OPEN',
    required: false,
  })
  dayStatus?: 'OPEN' | 'CLOSED' | 'CUTI' | 'EMPTY';

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

  @ApiProperty({ example: 24, required: false })
  totalCapacity?: number;

  @ApiProperty({ example: 0, required: false })
  bookedPatients?: number;

  @ApiProperty({ example: true, required: false })
  isClickable?: boolean;
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

  @ApiProperty({
    description: 'Canonical effective doctor schedule status',
    enum: ScheduleOperationalStatus,
    example: 'OPEN',
  })
  status_dokter: ScheduleOperationalStatus;

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

  @ApiProperty({
    description:
      'Interval backend-projected untuk timeline/Gantt admin detail sheet',
    type: () => [ScheduleProjectedIntervalEntity],
  })
  timeline_intervals: ScheduleProjectedIntervalEntity[];

  @ApiProperty({
    description:
      '4-shift 24-hour cycle projections with multi-dimensional states and counts',
    required: false,
  })
  shifts?: any[];

  @ApiProperty({
    description: 'Context projections with multi-dimensional states and counts',
    required: false,
  })
  context_projections?: any[];

  @ApiProperty({
    description:
      'Whole-day aggregated slot projection metrics and dual indicators',
    required: false,
  })
  metrics?: any;

  @ApiProperty({
    description:
      'Whole-day aggregated slot projection metrics and dual indicators',
    required: false,
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
}

export class ClinicalPractitionersResponse {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: () => [ClinicalPractitionerEntity] })
  data: ClinicalPractitionerEntity[];
}

export type ScheduleSlotOccupancyType = 'SELF' | 'OTHER' | 'LEAVE';

export class ScheduleSlotConflictInfoEntity {
  @ApiProperty({ enum: ['SELF', 'OTHER', 'LEAVE'], example: 'SELF' })
  type: ScheduleSlotOccupancyType;

  @ApiProperty({ example: 'Anda sudah memiliki jadwal di jam ini' })
  message: string;

  @ApiProperty({
    nullable: true,
    example: '8489be4c-7c05-4c07-b352-7bf579b29cb1',
  })
  sessionId?: string | null;

  @ApiProperty({
    nullable: true,
    example: '3cb62e10-450b-43e5-aba9-49ec37079ebb',
  })
  practitionerId?: string | null;

  @ApiProperty({ nullable: true, example: 'dr. Ahmad Santoso' })
  practitionerName?: string | null;

  @ApiProperty({
    nullable: true,
    example: 'e3067341-a185-484d-91d6-84848fcff1ef',
  })
  roomId?: string | null;

  @ApiProperty({ nullable: true, example: 'Ruang Poli 1' })
  roomName?: string | null;
}

export type ScheduleSlotStatus =
  | 'AVAILABLE'
  | 'OCCUPIED_BY_SELF'
  | 'OCCUPIED_BY_OTHER'
  | 'CLOSED_LEAVE';

export class ScheduleShiftSlotEntity {
  @ApiProperty({ example: 1 })
  slotIndex: number;

  @ApiProperty({ example: '02:00' })
  startTime: string;

  @ApiProperty({ example: '02:30' })
  endTime: string;

  @ApiProperty({ example: '02:00 - 02:30 WIB' })
  timeRange: string;

  @ApiProperty({ example: true })
  isAvailable: boolean;

  @ApiProperty({
    enum: [
      'AVAILABLE',
      'OCCUPIED_BY_SELF',
      'OCCUPIED_BY_OTHER',
      'CLOSED_LEAVE',
    ],
    example: 'AVAILABLE',
  })
  status: ScheduleSlotStatus;

  @ApiProperty({ example: 'Tersedia' })
  displayLabel: string;

  @ApiProperty({
    nullable: true,
    type: () => ScheduleSlotConflictInfoEntity,
  })
  conflictInfo?: ScheduleSlotConflictInfoEntity | null;
}

export class ScheduleShiftOccupancyEntity {
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

  @ApiProperty({ example: 12 })
  totalSlots: number;

  @ApiProperty({ example: 11 })
  availableSlotsCount: number;

  @ApiProperty({ example: 1 })
  occupiedSlotsCount: number;

  @ApiProperty({ type: () => [ScheduleShiftSlotEntity] })
  slots: ScheduleShiftSlotEntity[];
}

export class ScheduleOccupancySummaryEntity {
  @ApiProperty({ example: 4 })
  totalShifts: number;

  @ApiProperty({ example: 42 })
  totalSlots: number;

  @ApiProperty({ example: 35 })
  availableSlots: number;

  @ApiProperty({ example: 7 })
  occupiedSlots: number;
}

export class ScheduleOccupancyOverviewData {
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
  isCuti: boolean;

  @ApiProperty({ nullable: true, example: null })
  cutiReason?: string | null;

  @ApiProperty({ type: () => ScheduleOccupancySummaryEntity })
  summary: ScheduleOccupancySummaryEntity;

  @ApiProperty({ type: () => [ScheduleShiftOccupancyEntity] })
  shifts: ScheduleShiftOccupancyEntity[];
}

export class ScheduleOccupancyOverviewResponse {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: () => ScheduleOccupancyOverviewData })
  data: ScheduleOccupancyOverviewData;
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

  @ApiProperty({ example: '32 Thn' })
  age: string;

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

  @ApiProperty({ example: '2026-10-04' })
  appointmentDate: string;

  @ApiProperty({
    nullable: true,
    example: '9fa87102-4412-4211-91a1-872f2aa56e99',
  })
  queueTicketId: string | null;

  @ApiProperty({ example: 'P-001' })
  queueNumber: string;

  @ApiProperty({ example: '08:00 - 08:30 WIB' })
  timeSlot: string;

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

  @ApiProperty({ example: 'Menunggu' })
  statusBadge: string;

  @ApiProperty({
    nullable: true,
    example: 'Demam tinggi 3 hari dan batuk berdahak',
  })
  chiefComplaint: string | null;

  @ApiProperty({ example: 'Ruang Poli Umum 1' })
  clinicRoomName: string;

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

  @ApiProperty({ example: 12 })
  capacity: number;

  @ApiProperty({ example: 4 })
  availableSlots: number;

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

  @ApiProperty({ example: 12 })
  capacity: number;

  @ApiProperty({ example: 4 })
  availableSlots: number;

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

  @ApiProperty({ example: 48 })
  accumulatedCapacity: number;

  @ApiProperty({ example: 18 })
  accumulatedBookedCount: number;

  @ApiProperty({ example: 30 })
  accumulatedAvailableSlots: number;

  @ApiProperty({ type: () => [AdminDoctorAccumulatedSessionItem] })
  sessions: AdminDoctorAccumulatedSessionItem[];
}

export class AdminDoctorAccumulatedPatientsResponse {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: () => AdminDoctorAccumulatedPatientsData })
  data: AdminDoctorAccumulatedPatientsData;
}

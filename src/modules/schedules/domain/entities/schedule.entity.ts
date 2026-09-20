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

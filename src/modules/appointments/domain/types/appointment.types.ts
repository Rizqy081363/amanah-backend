export type AppointmentStatus =
  | 'WAITING'
  | 'IN_SERVICE'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'LATE';

export type DbAppointmentStatus =
  | 'booked'
  | 'checked_in'
  | 'waiting'
  | 'in_service'
  | 'completed'
  | 'cancelled'
  | 'no_doctor'
  | 'no_show'
  | 'late';

export type AppointmentAction = 'CALL' | 'START_SERVICE' | 'COMPLETE' | 'CANCEL';

export const ALLOWED_TRANSITIONS: Record<AppointmentStatus, readonly AppointmentStatus[]> = {
  WAITING: ['IN_SERVICE', 'CANCELLED', 'LATE'],
  IN_SERVICE: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  LATE: [],
};

export function toDomainStatus(dbStatus: string | null | undefined): AppointmentStatus {
  if (!dbStatus) return 'WAITING';
  const normalized = dbStatus.toLowerCase();
  if (normalized === 'in_service' || normalized === 'sedang_diperiksa') return 'IN_SERVICE';
  if (normalized === 'completed' || normalized === 'selesai') return 'COMPLETED';
  if (normalized === 'cancelled' || normalized === 'batal' || normalized === 'no_doctor') return 'CANCELLED';
  if (normalized === 'late' || normalized === 'no_show') return 'LATE';
  return 'WAITING';
}

export function toDbStatus(domainStatus: AppointmentStatus): DbAppointmentStatus {
  switch (domainStatus) {
    case 'IN_SERVICE':
      return 'in_service';
    case 'COMPLETED':
      return 'completed';
    case 'CANCELLED':
      return 'cancelled';
    case 'LATE':
      return 'late';
    case 'WAITING':
    default:
      return 'waiting';
  }
}

export function resolveAllowedActions(status: AppointmentStatus): AppointmentAction[] {
  switch (status) {
    case 'WAITING':
      return ['CALL', 'START_SERVICE', 'CANCEL'];
    case 'IN_SERVICE':
      return ['COMPLETE'];
    case 'COMPLETED':
    case 'CANCELLED':
    case 'LATE':
    default:
      return [];
  }
}

export interface AppointmentSlotInput {
  dayStart: Date;
  queueNumber: number;
  slotMinutes: number;
}

export interface PlannedSlot {
  estimatedStartAt: Date;
  estimatedEndAt: Date;
}

export interface AppointmentRecord {
  id: string;
  bookingCode: string;
  patientId: string;
  patientUserId?: string | null;
  patientName?: string | null;
  practitionerId: string;
  doctorName?: string | null;
  serviceId?: string | null;
  serviceName?: string | null;
  poliklinikId?: string | null;
  poliklinikName?: string | null;
  roomId?: string | null;
  roomName?: string | null;
  scheduledDate: string;
  queueNumber: number;
  status: AppointmentStatus;
  allowedActions: AppointmentAction[];
  estimatedStartAt: Date;
  estimatedEndAt: Date;
  actualStartedAt?: Date | null;
  actualCompletedAt?: Date | null;
  lastCalledAt?: Date | null;
  cancelledAt?: Date | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

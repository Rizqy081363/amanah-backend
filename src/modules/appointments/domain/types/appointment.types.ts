export type AppointmentStatus =
  | 'BOOKED'
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

export type AppointmentAction =
  | 'CHECK_IN'
  | 'CALL'
  | 'START_SERVICE'
  | 'COMPLETE'
  | 'CANCEL';

export const ALLOWED_TRANSITIONS: Record<
  AppointmentStatus,
  readonly AppointmentStatus[]
> = {
  BOOKED: ['WAITING', 'CANCELLED', 'LATE'],
  WAITING: ['IN_SERVICE', 'CANCELLED', 'LATE'],
  IN_SERVICE: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  LATE: [],
};

export function toDomainStatus(
  dbStatus: DbAppointmentStatus | string | null | undefined,
): AppointmentStatus {
  switch (dbStatus) {
    case 'booked':
      return 'BOOKED';
    case 'in_service':
      return 'IN_SERVICE';
    case 'completed':
      return 'COMPLETED';
    case 'cancelled':
    case 'no_doctor':
      return 'CANCELLED';
    case 'late':
    case 'no_show':
      return 'LATE';
    case 'waiting':
    case 'checked_in':
    default:
      return 'WAITING';
  }
}

export function toDbStatus(
  domainStatus: AppointmentStatus,
): DbAppointmentStatus {
  switch (domainStatus) {
    case 'BOOKED':
      return 'booked';
    case 'IN_SERVICE':
      return 'in_service';
    case 'COMPLETED':
      return 'completed';
    case 'CANCELLED':
      return 'cancelled';
    case 'LATE':
      return 'late';
    default:
      return 'waiting';
  }
}

export function resolveAllowedActions(
  status: AppointmentStatus,
): AppointmentAction[] {
  switch (status) {
    case 'BOOKED':
      return ['CHECK_IN', 'CANCEL'];
    case 'WAITING':
      return ['CALL', 'START_SERVICE', 'CANCEL'];
    case 'IN_SERVICE':
      return ['COMPLETE'];
    default:
      return [];
  }
}

export interface AppointmentTimingInput {
  dayStart: Date;
  queueNumber: number;
  durationMinutes: number;
}

export interface EstimatedTiming {
  estimatedStartAt: Date;
  estimatedEndAt: Date;
}

export interface AppointmentRecord {
  id: string;
  bookingCode: string;
  patientId: string;
  patientUserId?: string | null;
  isAffiliated?: boolean;
  affiliationRelationship?: string | null;
  parentUserId?: string | null;
  parentUserName?: string | null;
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
  checkedInAt?: Date | null;
  consultationElapsedSeconds?: number | null;
  consultationDurationFormatted?: string | null;
  lastCalledAt?: Date | null;
  cancelledAt?: Date | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

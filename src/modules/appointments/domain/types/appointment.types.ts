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
  | 'CANCEL'
  | 'RESCHEDULE'
  | 'ASSIGN_DOCTOR'
  | 'ASSIGN_ROOM'
  | 'NO_SHOW';

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

export interface AllowedActionsContext {
  hasDoctor?: boolean;
  hasRoom?: boolean;
  aheadCount?: number;
  isDoctorServing?: boolean;
}

export function resolveAllowedActions(
  status: AppointmentStatus,
  contextOrAheadCount: AllowedActionsContext | number = 0,
): AppointmentAction[] {
  const context: AllowedActionsContext =
    typeof contextOrAheadCount === 'number'
      ? { aheadCount: contextOrAheadCount, hasDoctor: true, hasRoom: true }
      : contextOrAheadCount;

  const {
    hasDoctor = false,
    hasRoom = false,
  } = context;
  const isFullyAssigned = Boolean(hasDoctor && hasRoom);

  switch (status) {
    case 'BOOKED': {
      const actions: AppointmentAction[] = [];
      if (!hasDoctor) {
        actions.push('ASSIGN_DOCTOR');
      }
      if (!hasRoom) {
        actions.push('ASSIGN_ROOM');
      }
      if (isFullyAssigned) {
        actions.push('CHECK_IN');
      }
      actions.push('CANCEL', 'RESCHEDULE');
      return actions;
    }
    case 'WAITING':
      return ['CALL', 'START_SERVICE', 'NO_SHOW', 'CANCEL', 'RESCHEDULE'];
    case 'LATE':
      return ['RESCHEDULE', 'CANCEL'];
    case 'IN_SERVICE':
      return ['COMPLETE', 'CANCEL'];
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
  avatarUrl?: string | null;
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

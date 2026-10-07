import type {
  AppointmentRecord,
  AppointmentStatus,
} from '../../domain/types/appointment.types';

export interface CreateAppointmentInput {
  bookingCode: string;
  patientId: string;
  practitionerId: string;
  serviceId?: string | null;
  poliklinikId?: string | null;
  roomId?: string | null;
  scheduledDate: string;
  queueNumber: number;
  estimatedStartAt: Date;
  estimatedEndAt: Date;
  notes?: string | null;
}

export interface TransitionStatusInput {
  id: string;
  expectedStatus: AppointmentStatus;
  targetStatus: AppointmentStatus;
  actualStartedAt?: Date | null;
  actualCompletedAt?: Date | null;
  cancelledAt?: Date | null;
  cancellationReason?: string | null;
}

export interface AppointmentFilter {
  date?: string;
  practitionerId?: string;
  patientId?: string;
  status?: AppointmentStatus;
  page?: number;
  limit?: number;
}

export interface AppointmentListResult {
  items: AppointmentRecord[];
  total: number;
}

export const APPOINTMENT_REPOSITORY_PORT = Symbol(
  'APPOINTMENT_REPOSITORY_PORT',
);

export interface AppointmentRepositoryPort {
  findById(id: string): Promise<AppointmentRecord | null>;
  getNextQueueNumber(
    practitionerId: string,
    scheduledDate: string,
    tx?: unknown,
  ): Promise<number>;
  createWithSlot(
    input: CreateAppointmentInput,
    tx?: unknown,
  ): Promise<AppointmentRecord>;
  updateLastCalledAt(id: string, calledAt: Date): Promise<AppointmentRecord>;
  transitionStatus(input: TransitionStatusInput): Promise<AppointmentRecord>;
  sweepLateness(threshold: Date): Promise<number>;
  list(filter: AppointmentFilter): Promise<AppointmentListResult>;
}

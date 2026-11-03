import type { AppointmentStatus } from '../../domain/types/appointment.types';

export interface StatusChangedEvent {
  appointmentId: string;
  status: AppointmentStatus;
  previousStatus: AppointmentStatus;
  queueNumber: number;
  practitionerId: string;
  actualStartedAt?: string | null;
  actualCompletedAt?: string | null;
  patientUserId?: string | null;
}

export interface PatientCalledEvent {
  appointmentId: string;
  queueNumber: number;
  practitionerId: string;
  calledAt: Date;
  patientName?: string | null;
  patientUserId?: string | null;
}

export interface CheckInWindowOpenedEvent {
  appointmentId: string;
  scheduledDate: string;
  scheduledStartTime?: string | null;
  queueNumber?: number | string | null;
  patientName?: string | null;
  patientUserId?: string | null;
  doctorName?: string | null;
  roomName?: string | null;
  serviceName?: string | null;
}

export const REALTIME_EMITTER_PORT = Symbol('REALTIME_EMITTER_PORT');

export interface RealtimeEmitterPort {
  emitStatusChanged(event: StatusChangedEvent): Promise<void>;
  emitPatientCalled(event: PatientCalledEvent): Promise<void>;
  emitCheckInWindowOpened(event: CheckInWindowOpenedEvent): Promise<void>;
}

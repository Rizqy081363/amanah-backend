import type { AppointmentStatus } from '../../domain/types/appointment.types';

export interface StatusChangedEvent {
  appointmentId: string;
  status: AppointmentStatus;
  previousStatus: AppointmentStatus;
  queueNumber: number;
  practitionerId: string;
}

export interface PatientCalledEvent {
  appointmentId: string;
  queueNumber: number;
  practitionerId: string;
  calledAt: Date;
  patientName?: string | null;
}

export const REALTIME_EMITTER_PORT = Symbol('REALTIME_EMITTER_PORT');

export interface RealtimeEmitterPort {
  emitStatusChanged(event: StatusChangedEvent): Promise<void>;
  emitPatientCalled(event: PatientCalledEvent): Promise<void>;
}

import type { AppointmentCheckInEntity } from '../../domain/entities/appointment-check-in.entity';

export const APPOINTMENT_CHECK_IN_REPOSITORY_PORT = Symbol(
  'APPOINTMENT_CHECK_IN_REPOSITORY_PORT',
);

export interface CreateCheckInRecordInput {
  appointmentId: string;
  token: string;
  manualCode: string;
  expiresAt: Date;
  createdBy?: string | null;
}

export interface AppointmentCheckInRepositoryPort {
  createCheckIn(
    input: CreateCheckInRecordInput,
  ): Promise<AppointmentCheckInEntity>;
  findActiveByAppointmentId(
    appointmentId: string,
  ): Promise<AppointmentCheckInEntity | null>;
  findByToken(token: string): Promise<AppointmentCheckInEntity | null>;
  findByManualCode(
    manualCode: string,
  ): Promise<AppointmentCheckInEntity | null>;
  markAsUsed(
    id: string,
    usedByUserId?: string | null,
    usedAt?: Date,
  ): Promise<void>;
  invalidateExistingTokens(appointmentId: string): Promise<void>;
}

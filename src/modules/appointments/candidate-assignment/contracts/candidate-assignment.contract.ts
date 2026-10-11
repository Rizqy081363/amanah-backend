import type { AppointmentEntity } from '../../domain/entities/appointment.entity';

export const CANDIDATE_ASSIGNMENT_PORT = Symbol('CANDIDATE_ASSIGNMENT_PORT');

export interface ChangeDoctorOptions {
  closeOldSchedule?: boolean;
  reason?: string;
}

export interface ICandidateAssignmentPort {
  changeDoctor(
    appointmentId: string,
    targetDoctorId: string,
    options?: ChangeDoctorOptions,
    user?: any,
  ): Promise<AppointmentEntity>;

  changeRoom(
    appointmentId: string,
    targetRoomId: string,
    user?: any,
  ): Promise<AppointmentEntity>;
}

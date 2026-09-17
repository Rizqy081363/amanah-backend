import { AppointmentEntity } from '../entities/appointment.entity';

export const APPOINTMENT_REPOSITORY = 'APPOINTMENT_REPOSITORY';

export interface AppointmentRepository {
  create(
    data: Omit<AppointmentEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<AppointmentEntity>;
  findById(id: string): Promise<AppointmentEntity | null>;
  findByQueueNumber(
    queueNumber: string,
    date: string,
  ): Promise<AppointmentEntity | null>;
  findByPatientId(patientId: string): Promise<AppointmentEntity[]>;
  findDailyQueue(
    poliklinikId: string,
    date: string,
    session?: string,
  ): Promise<AppointmentEntity[]>;
  updateStatus(
    id: string,
    status: AppointmentEntity['status'],
    staffId?: string,
  ): Promise<AppointmentEntity | null>;
  getNextQueueIndex(
    poliklinikId: string,
    date: string,
    session: string,
  ): Promise<number>;
}

import { AppointmentEntity } from '../entities/appointment.entity';

export const APPOINTMENT_REPOSITORY = 'APPOINTMENT_REPOSITORY';

export interface AppointmentRepository {
  create(
    data: Omit<AppointmentEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<AppointmentEntity>;
  findById(id: string): Promise<AppointmentEntity | null>;
  findAll(
    limit?: number,
    offset?: number,
    filters?: {
      poliklinikId?: string;
      date?: string;
      session?: string;
      status?: string;
      patientId?: string;
    },
  ): Promise<AppointmentEntity[]>;
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
  findDisplayQueue(date: string, poliklinikId?: string): Promise<any>;
  updateStatus(
    id: string,
    status: AppointmentEntity['status'],
    staffId?: string,
    cancellationReason?: string,
  ): Promise<AppointmentEntity | null>;
  getNextQueueIndex(
    poliklinikId: string,
    date: string,
    session: string,
  ): Promise<number>;
  delete(id: string): Promise<boolean>;
}

import { AdminUpdateAppointmentStatusDto } from '../../presentation/dto/admin-update-appointment-status.dto';
import { CancelAppointmentDto } from '../../presentation/dto/cancel-appointment.dto';
import { RescheduleAppointmentDto } from '../../presentation/dto/reschedule-appointment.dto';
import { AppointmentEntity } from '../entities/appointment.entity';

export const APPOINTMENT_REPOSITORY = 'APPOINTMENT_REPOSITORY';

export interface AppointmentFindAllResult {
  data: AppointmentEntity[];
  meta: {
    nextCursor: string | null;
    hasNextPage: boolean;
    limit: number;
    total?: number;
    page?: number;
  };
}

export abstract class AppointmentRepository {
  abstract create(
    data: Omit<AppointmentEntity, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<AppointmentEntity>;
  abstract findById(id: string): Promise<AppointmentEntity | null>;
  abstract findAll(
    limit?: number,
    offset?: number,
    filters?: {
      poliklinikId?: string;
      poliklinikName?: string;
      date?: string;
      session?: string;
      status?: string;
      patientId?: string;
      search?: string;
      cursor?: string;
    },
  ): Promise<AppointmentFindAllResult>;
  abstract findByQueueNumber(
    queueNumber: string,
    date: string,
  ): Promise<AppointmentEntity | null>;
  abstract findByPatientId(patientId: string): Promise<AppointmentEntity[]>;
  abstract findByUserId(userId: string): Promise<AppointmentEntity[]>;
  abstract getRescheduleOptions(
    appointmentId: string,
    userId: string,
  ): Promise<any>;
  abstract reschedule(
    appointmentId: string,
    dto: RescheduleAppointmentDto,
    userId: string,
  ): Promise<AppointmentEntity>;
  abstract findDailyQueue(
    poliklinikId: string,
    date: string,
    session?: string,
  ): Promise<AppointmentEntity[]>;
  abstract findDisplayQueue(date: string, poliklinikId?: string): Promise<any>;
  abstract updateStatus(
    id: string,
    status: AppointmentEntity['status'],
    staffId?: string,
    cancellationReason?: string,
    expectedVersion?: string,
  ): Promise<AppointmentEntity | null>;
  abstract getNextQueueIndex(
    poliklinikId: string,
    date: string,
    session: string,
  ): Promise<number>;
  abstract delete(id: string): Promise<boolean>;
  abstract cancelAdminAppointment(
    appointmentId: string,
    dto: CancelAppointmentDto,
    actorUserId?: string,
  ): Promise<{
    success: boolean;
    message: string;
    data: any;
  }>;
  abstract updateAdminAppointmentStatus(
    appointmentId: string,
    dto: AdminUpdateAppointmentStatusDto,
    actorUserId?: string,
  ): Promise<{
    success: boolean;
    message: string;
    data: any;
  }>;
}

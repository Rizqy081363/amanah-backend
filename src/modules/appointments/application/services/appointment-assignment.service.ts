import { Injectable } from '@nestjs/common';
import type {
  BulkOperationResult,
  ChangeDoctorOptions,
  ICandidateAssignmentPort,
} from '../../candidate-assignment/contracts/candidate-assignment.contract';
import { CandidateAssignmentService } from '../../candidate-assignment/services/candidate-assignment.service';
import { AppointmentEntity } from '../../domain/entities/appointment.entity';

export type { BulkOperationResult, ChangeDoctorOptions };

@Injectable()
export class AppointmentAssignmentService implements ICandidateAssignmentPort {
  constructor(private readonly delegate: CandidateAssignmentService) {}

  async changeDoctor(
    appointmentId: string,
    targetDoctorId: string,
    optionsOrUser?: ChangeDoctorOptions | any,
    user?: any,
  ): Promise<AppointmentEntity> {
    return this.delegate.changeDoctor(
      appointmentId,
      targetDoctorId,
      optionsOrUser,
      user,
    );
  }

  async changeRoom(
    appointmentId: string,
    targetRoomId: string,
    user?: any,
  ): Promise<AppointmentEntity> {
    return this.delegate.changeRoom(appointmentId, targetRoomId, user);
  }

  async changeService(
    appointmentId: string,
    targetServiceId: string,
    user?: any,
    options?: { complaint?: string },
  ): Promise<AppointmentEntity> {
    return this.delegate.changeService(appointmentId, targetServiceId, user, options);
  }

  async bulkChangeDoctor(
    appointmentIds: string[],
    targetDoctorId: string,
    options?: ChangeDoctorOptions,
    user?: any,
  ): Promise<BulkOperationResult> {
    return this.delegate.bulkChangeDoctor(
      appointmentIds,
      targetDoctorId,
      options,
      user,
    );
  }

  async bulkChangeRoom(
    appointmentIds: string[],
    targetRoomId: string,
    user?: any,
  ): Promise<BulkOperationResult> {
    return this.delegate.bulkChangeRoom(appointmentIds, targetRoomId, user);
  }
}

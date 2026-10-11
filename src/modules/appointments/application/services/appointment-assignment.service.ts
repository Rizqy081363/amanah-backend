import { Injectable } from '@nestjs/common';
import { AppointmentEntity } from '../../domain/entities/appointment.entity';
import type {
  ChangeDoctorOptions,
  ICandidateAssignmentPort,
} from '../../candidate-assignment/contracts/candidate-assignment.contract';
import { CandidateAssignmentService } from '../../candidate-assignment/services/candidate-assignment.service';

export type { ChangeDoctorOptions };

@Injectable()
export class AppointmentAssignmentService implements ICandidateAssignmentPort {
  constructor(
    private readonly delegate: CandidateAssignmentService,
  ) {}

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
}

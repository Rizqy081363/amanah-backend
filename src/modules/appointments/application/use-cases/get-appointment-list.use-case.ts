import { Inject, Injectable } from '@nestjs/common';
import {
  APPOINTMENT_REPOSITORY_PORT,
  type AppointmentFilter,
  type AppointmentListResult,
  type AppointmentRepositoryPort,
} from '../ports/appointment-repository.port';

@Injectable()
export class GetAppointmentListUseCase {
  constructor(
    @Inject(APPOINTMENT_REPOSITORY_PORT)
    private readonly appointmentRepo: AppointmentRepositoryPort,
  ) {}

  async execute(filter: AppointmentFilter): Promise<AppointmentListResult> {
    return await this.appointmentRepo.list(filter);
  }
}

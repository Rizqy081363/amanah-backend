import { Inject, Injectable, Logger } from '@nestjs/common';
import { AppointmentPolicyReader } from '../../domain/services/appointment-policy.reader';
import {
  APPOINTMENT_REPOSITORY_PORT,
  type AppointmentRepositoryPort,
} from '../ports/appointment-repository.port';

@Injectable()
export class SweepLateAppointmentsUseCase {
  private readonly logger = new Logger(SweepLateAppointmentsUseCase.name);

  constructor(
    @Inject(APPOINTMENT_REPOSITORY_PORT)
    private readonly appointmentRepo: AppointmentRepositoryPort,
    private readonly policyReader: AppointmentPolicyReader,
  ) {}

  async execute(now: Date = new Date()): Promise<number> {
    const windowHours = await this.policyReader.getCheckInWindowHours();
    const windowMs = windowHours * 60 * 60 * 1000;
    const threshold = new Date(now.getTime() - windowMs);
    const sweptCount = await this.appointmentRepo.sweepLateness(threshold);
    if (sweptCount > 0) {
      this.logger.log(`Swept ${sweptCount} appointments to LATE status`);
    }
    return sweptCount;
  }
}

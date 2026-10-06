import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  APPOINTMENT_REPOSITORY_PORT,
  type AppointmentRepositoryPort,
} from '../ports/appointment-repository.port';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class SweepLateAppointmentsUseCase {
  private readonly logger = new Logger(SweepLateAppointmentsUseCase.name);

  constructor(
    @Inject(APPOINTMENT_REPOSITORY_PORT)
    private readonly appointmentRepo: AppointmentRepositoryPort,
  ) {}

  async execute(now: Date = new Date()): Promise<number> {
    const threshold = new Date(now.getTime() - TWENTY_FOUR_HOURS_MS);
    const sweptCount = await this.appointmentRepo.sweepLateness(threshold);
    if (sweptCount > 0) {
      this.logger.log(`Swept ${sweptCount} appointments to LATE status`);
    }
    return sweptCount;
  }
}

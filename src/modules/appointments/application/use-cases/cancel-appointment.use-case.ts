import { Inject, Injectable } from '@nestjs/common';
import type { AppointmentRecord } from '../../domain/types/appointment.types';
import {
  APPOINTMENT_REPOSITORY_PORT,
  type AppointmentRepositoryPort,
} from '../ports/appointment-repository.port';
import {
  REALTIME_EMITTER_PORT,
  type RealtimeEmitterPort,
} from '../ports/realtime-emitter.port';

@Injectable()
export class CancelAppointmentUseCase {
  constructor(
    @Inject(APPOINTMENT_REPOSITORY_PORT)
    private readonly appointmentRepo: AppointmentRepositoryPort,
    @Inject(REALTIME_EMITTER_PORT)
    private readonly realtimeEmitter: RealtimeEmitterPort,
  ) {}

  async execute(appointmentId: string, reason?: string): Promise<AppointmentRecord> {
    const cancelledAt = new Date();
    const updated = await this.appointmentRepo.transitionStatus({
      id: appointmentId,
      expectedStatus: 'WAITING',
      targetStatus: 'CANCELLED',
      cancelledAt,
      cancellationReason: reason,
    });

    await this.realtimeEmitter.emitStatusChanged({
      appointmentId: updated.id,
      status: 'CANCELLED',
      previousStatus: 'WAITING',
      queueNumber: updated.queueNumber,
      practitionerId: updated.practitionerId,
    });

    return updated;
  }
}

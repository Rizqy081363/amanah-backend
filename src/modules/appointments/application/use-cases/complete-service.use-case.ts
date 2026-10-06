import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import type { AppointmentRecord } from '../../domain/types/appointment.types';
import {
  APPOINTMENT_REPOSITORY_PORT,
  type AppointmentRepositoryPort,
} from '../ports/appointment-repository.port';
import {
  PUSH_NOTIFICATION_PORT,
  type PushNotificationPort,
} from '../ports/push-notification.port';
import {
  REALTIME_EMITTER_PORT,
  type RealtimeEmitterPort,
} from '../ports/realtime-emitter.port';

@Injectable()
export class CompleteServiceUseCase {
  private readonly logger = new Logger(CompleteServiceUseCase.name);

  constructor(
    @Inject(APPOINTMENT_REPOSITORY_PORT)
    private readonly appointmentRepo: AppointmentRepositoryPort,
    @Inject(REALTIME_EMITTER_PORT)
    private readonly realtimeEmitter: RealtimeEmitterPort,
    @Optional()
    @Inject(PUSH_NOTIFICATION_PORT)
    private readonly pushNotification?: PushNotificationPort,
  ) {}

  async execute(appointmentId: string): Promise<AppointmentRecord> {
    const actualCompletedAt = new Date();
    const updated = await this.appointmentRepo.transitionStatus({
      id: appointmentId,
      expectedStatus: 'IN_SERVICE',
      targetStatus: 'COMPLETED',
      actualCompletedAt,
    });

    await this.realtimeEmitter.emitStatusChanged({
      appointmentId: updated.id,
      status: 'COMPLETED',
      previousStatus: 'IN_SERVICE',
      queueNumber: updated.queueNumber,
      practitionerId: updated.practitionerId,
    });

    if (this.pushNotification && updated.patientUserId) {
      const timeStr = actualCompletedAt.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
      });
      this.pushNotification
        .sendPush({
          userId: updated.patientUserId,
          title: 'Pemeriksaan Selesai',
          body: `Pemeriksaan medis untuk nomor antrean ${updated.queueNumber} telah selesai pada pukul ${timeStr} WIB.`,
          data: {
            appointmentId: updated.id,
            queueNumber: updated.queueNumber,
            status: 'COMPLETED',
            actualCompletedAt: actualCompletedAt.toISOString(),
          },
        })
        .catch((error) => {
          this.logger.warn(
            `Push notification failed on completion for patient ${updated.patientUserId}: ${error.message}`,
          );
        });
    }

    return updated;
  }
}

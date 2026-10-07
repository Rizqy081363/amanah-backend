import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { RedisService } from '../../../../common/redis/redis.service';
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
export class CancelAppointmentUseCase {
  private readonly logger = new Logger(CancelAppointmentUseCase.name);

  constructor(
    @Inject(APPOINTMENT_REPOSITORY_PORT)
    private readonly appointmentRepo: AppointmentRepositoryPort,
    @Inject(REALTIME_EMITTER_PORT)
    private readonly realtimeEmitter: RealtimeEmitterPort,
    @Optional()
    @Inject(PUSH_NOTIFICATION_PORT)
    private readonly pushNotification?: PushNotificationPort,
    @Optional()
    private readonly redisService?: RedisService,
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

    if (this.redisService) {
      await Promise.allSettled([
        this.redisService.deleteByPrefix('queue:daily'),
        this.redisService.deleteByPrefix('queue:display'),
        this.redisService.invalidateTags('queue', 'daily', 'display'),
      ]);
    }

    await this.realtimeEmitter.emitStatusChanged({
      appointmentId: updated.id,
      status: 'CANCELLED',
      previousStatus: 'WAITING',
      queueNumber: updated.queueNumber,
      practitionerId: updated.practitionerId,
    });

    if (this.pushNotification && updated.patientUserId) {
      const reasonText = reason ? `. Alasan: ${reason}` : '';
      this.pushNotification
        .sendPush({
          userId: updated.patientUserId,
          title: 'Janji Temu Dibatalkan',
          body: `Janji temu nomor antrean ${updated.queueNumber} (${updated.patientName || 'Pasien'}) telah dibatalkan${reasonText}.`,
          data: {
            appointmentId: updated.id,
            queueNumber: String(updated.queueNumber),
            status: 'CANCELLED',
          },
        })
        .catch((error) => {
          this.logger.warn(
            `Push notification failed on cancel for patient ${updated.patientUserId}: ${error.message}`,
          );
        });
    }

    return updated;
  }
}

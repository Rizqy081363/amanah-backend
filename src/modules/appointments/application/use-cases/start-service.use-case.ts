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
export class StartServiceUseCase {
  private readonly logger = new Logger(StartServiceUseCase.name);

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

  async execute(appointmentId: string): Promise<AppointmentRecord> {
    const actualStartedAt = new Date();
    const updated = await this.appointmentRepo.transitionStatus({
      id: appointmentId,
      expectedStatus: 'WAITING',
      targetStatus: 'IN_SERVICE',
      actualStartedAt,
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
      status: 'IN_SERVICE',
      previousStatus: 'WAITING',
      queueNumber: updated.queueNumber,
      practitionerId: updated.practitionerId,
      actualStartedAt: actualStartedAt.toISOString(),
    });

    if (this.pushNotification && updated.patientUserId) {
      this.pushNotification
        .sendPush({
          userId: updated.patientUserId,
          title: 'Pemeriksaan Sedang Berlangsung',
          body: `Pasien ${updated.patientName || 'Pasien'} (Nomor antrean ${updated.queueNumber}) sedang dalam pemeriksaan di ${updated.poliklinikName || 'Poliklinik'}.`,
          data: {
            appointmentId: updated.id,
            queueNumber: String(updated.queueNumber),
            status: 'IN_SERVICE',
            actualStartedAt: actualStartedAt.toISOString(),
          },
        })
        .catch((error) => {
          this.logger.warn(
            `Push notification failed on start service for patient ${updated.patientUserId}: ${error.message}`,
          );
        });
    }

    return updated;
  }
}

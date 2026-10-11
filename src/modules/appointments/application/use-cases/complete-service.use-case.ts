import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { RedisService } from '../../../../common/redis/redis.service';
import { ClinicTimeService } from '../../../../common/time/clinic-time.service';
import { QueueEventPublisher } from '../../../queue-engine/application/services/queue-event-publisher.service';
import { DOMAIN_APPOINTMENT_STATUS } from '../../domain/constants/appointment-lifecycle.constants';
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
    @Optional()
    private readonly redisService?: RedisService,
    @Optional()
    private readonly clinicTimeService?: ClinicTimeService,
    @Optional()
    private readonly queueEventPublisher?: QueueEventPublisher,
  ) {}

  async execute(appointmentId: string): Promise<AppointmentRecord> {
    const actualCompletedAt = new Date();
    const updated = await this.appointmentRepo.transitionStatus({
      id: appointmentId,
      expectedStatus: DOMAIN_APPOINTMENT_STATUS.IN_SERVICE,
      targetStatus: DOMAIN_APPOINTMENT_STATUS.COMPLETED,
      actualCompletedAt,
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
      status: DOMAIN_APPOINTMENT_STATUS.COMPLETED,
      previousStatus: DOMAIN_APPOINTMENT_STATUS.IN_SERVICE,
      queueNumber: updated.queueNumber,
      practitionerId: updated.practitionerId,
      actualCompletedAt: actualCompletedAt.toISOString(),
    });

    if (this.pushNotification && updated.patientUserId) {
      const timeStr = this.clinicTimeService
        ? this.clinicTimeService.formatTime(actualCompletedAt).slice(0, 5)
        : actualCompletedAt.toISOString().slice(11, 16);
      const tzAbbr =
        this.clinicTimeService?.getTimezoneAbbreviation(actualCompletedAt) ||
        'WIB';
      const patientInfo = updated.patientName
        ? ` (${updated.patientName})`
        : '';
      this.pushNotification
        .sendPush({
          userId: updated.patientUserId,
          title: 'Pemeriksaan Selesai',
          body: `Pemeriksaan medis untuk nomor antrean ${updated.queueNumber}${patientInfo} telah selesai pada pukul ${timeStr} ${tzAbbr}.`,
          data: {
            appointmentId: updated.id,
            queueNumber: String(updated.queueNumber),
            status: DOMAIN_APPOINTMENT_STATUS.COMPLETED,
            actualCompletedAt: actualCompletedAt.toISOString(),
          },
        })
        .catch((error) => {
          this.logger.warn(
            `Push notification failed on completion for patient ${updated.patientUserId}: ${error.message}`,
          );
        });
    }

    if (this.queueEventPublisher) {
      this.queueEventPublisher
        .publishProgression({
          eventType: 'completed',
          serviceDate: updated.scheduledDate,
          appointmentId: updated.id,
        })
        .catch((err) => {
          this.logger.warn(
            `Failed to publish progression on complete for appointment ${updated.id}: ${err.message}`,
          );
        });
    }

    return updated;
  }
}

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { RedisService } from '../../../../common/redis/redis.service';
import { QueuePositionRecalculationService } from '../../../queue-engine/application/services/queue-position-recalculation.service';
import { DOMAIN_APPOINTMENT_STATUS } from '../../domain/constants/appointment-lifecycle.constants';
import type { AppointmentRecord } from '../../domain/types/appointment.types';
import { AppointmentNotificationPublisher } from '../appointment-notification.publisher';
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
    @Optional()
    private readonly queuePositionRecalculationService?: QueuePositionRecalculationService,
    @Optional()
    private readonly notificationPublisher?: AppointmentNotificationPublisher,
  ) {}

  async execute(
    appointmentId: string,
    reason?: string,
    user?: any,
  ): Promise<AppointmentRecord> {
    const cancelledAt = new Date();
    const updated = await this.appointmentRepo.transitionStatus({
      id: appointmentId,
      expectedStatus: DOMAIN_APPOINTMENT_STATUS.WAITING,
      targetStatus: DOMAIN_APPOINTMENT_STATUS.CANCELLED,
      cancelledAt,
      cancellationReason: reason,
    });

    if (this.queuePositionRecalculationService) {
      await this.queuePositionRecalculationService
        .recalculateDoctorQueue({
          serviceDate: updated.scheduledDate,
          practitionerId: updated.practitionerId || null,
        })
        .catch((err) => {
          this.logger.warn(
            `Failed to recalculate queue positions on cancellation: ${err.message}`,
          );
        });
    }

    if (this.redisService) {
      await Promise.allSettled([
        this.redisService.deleteByPrefix('queue:daily'),
        this.redisService.deleteByPrefix('queue:display'),
        this.redisService.invalidateTags(
          'queue',
          'daily',
          'display',
          'appointments',
          'appointments:me',
        ),
      ]);
    }

    await this.realtimeEmitter.emitStatusChanged({
      appointmentId: updated.id,
      status: DOMAIN_APPOINTMENT_STATUS.CANCELLED,
      previousStatus: DOMAIN_APPOINTMENT_STATUS.WAITING,
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
            status: DOMAIN_APPOINTMENT_STATUS.CANCELLED,
          },
        })
        .catch((error) => {
          this.logger.warn(
            `Push notification failed on cancel for patient ${updated.patientUserId}: ${error.message}`,
          );
        });
    }

    if (this.notificationPublisher) {
      await this.notificationPublisher
        .publishCancelled(
          {
            id: updated.id,
            patientId: updated.patientId,
            patientUserId: updated.patientUserId,
            patientName: updated.patientName,
            avatarUrl: updated.avatarUrl ?? null,
            doctorName: updated.doctorName,
            staffId: updated.practitionerId,
            poliklinikId: updated.poliklinikId,
            poliklinikName: updated.poliklinikName,
            layananId: updated.serviceId,
            layananName: updated.serviceName,
            roomName: updated.roomName,
            appointmentDate: updated.scheduledDate,
            queueNumber: String(updated.queueNumber),
            status: updated.status,
          },
          reason || 'Dibatalkan',
          user,
        )
        .catch((error) => {
          this.logger.warn(
            `Failed to publish cancelled notification event: ${error.message}`,
          );
        });
    }

    return updated;
  }
}

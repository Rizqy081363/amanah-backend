import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { NOTIFICATION_AUDIENCE } from '../../../../common/constants/notification-audience.constants';
import { RedisService } from '../../../../common/redis/redis.service';
import { ClinicTimeService } from '../../../../common/time/clinic-time.service';
import { QueueEventPublisher } from '../../../queue-engine/application/services/queue-event-publisher.service';
import { DOMAIN_APPOINTMENT_STATUS } from '../../domain/constants/appointment-lifecycle.constants';
import type { AppointmentEntity } from '../../domain/entities/appointment.entity';
import {
  AppointmentMissingDoctorError,
  AppointmentMissingRoomError,
  AppointmentNotFoundError,
  CheckInAlreadyUsedError,
  CheckInExpiredError,
  CheckInForbiddenError,
  CheckInNotTodayError,
  CheckInWindowExpiredError,
  CheckInWindowTooEarlyError,
  InvalidStatusTransitionError,
} from '../../domain/errors/appointment-domain.errors';
import {
  APPOINTMENT_REPOSITORY,
  type AppointmentRepository,
} from '../../domain/repositories/appointment.repository';
import { isAppointmentWithinCheckInWindow } from '../../domain/services/appointment-check-in-window.predicate';
import { AppointmentPolicyReader } from '../../domain/services/appointment-policy.reader';
import { AppointmentNotificationPublisher } from '../appointment-notification.publisher';
import {
  APPOINTMENT_CHECK_IN_REPOSITORY_PORT,
  type AppointmentCheckInRepositoryPort,
} from '../ports/appointment-check-in.repository.port';
import {
  PUSH_NOTIFICATION_PORT,
  type PushNotificationPort,
} from '../ports/push-notification.port';
import {
  REALTIME_EMITTER_PORT,
  type RealtimeEmitterPort,
} from '../ports/realtime-emitter.port';

@Injectable()
export class AppointmentCheckInLifecycleService {
  private readonly logger = new Logger(AppointmentCheckInLifecycleService.name);

  constructor(
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepo: AppointmentRepository,
    @Inject(APPOINTMENT_CHECK_IN_REPOSITORY_PORT)
    private readonly checkInRepo: AppointmentCheckInRepositoryPort,
    @Inject(REALTIME_EMITTER_PORT)
    private readonly realtimeEmitter: RealtimeEmitterPort,
    private readonly clinicTimeService: ClinicTimeService,
    @Optional()
    private readonly policyReader?: AppointmentPolicyReader,
    @Optional()
    @Inject(PUSH_NOTIFICATION_PORT)
    private readonly pushNotification?: PushNotificationPort,
    @Optional()
    private readonly redisService?: RedisService,
    @Optional()
    private readonly notificationPublisher?: AppointmentNotificationPublisher,
    @Optional()
    private readonly queueEventPublisher?: QueueEventPublisher,
  ) {}

  /**
   * Validates appointment domain invariants, scheduling windows, and permissions,
   * then transitions the appointment to WAITING and broadcasts events.
   */
  async validateAndFinalize(
    checkInRecord: {
      id: string;
      appointmentId: string;
      isUsed: boolean;
      expiresAt: Date;
    },
    actorUser?: any,
  ): Promise<AppointmentEntity> {
    const appointment = await this.appointmentRepo.findById(
      checkInRecord.appointmentId,
    );
    if (!appointment) {
      throw new AppointmentNotFoundError(checkInRecord.appointmentId);
    }

    // External patient authorization boundary
    if (actorUser && actorUser.audience === NOTIFICATION_AUDIENCE.EXTERNAL) {
      const callerUserId = actorUser.id || actorUser.sub;
      const isOwner =
        callerUserId === appointment.patientUserId ||
        callerUserId === appointment.parentUserId ||
        callerUserId === appointment.createdBy ||
        actorUser.patient?.id === appointment.patientId;
      if (!isOwner) {
        throw new CheckInForbiddenError(
          'Anda tidak memiliki izin untuk melakukan check-in janji temu ini.',
        );
      }
    }

    // Lifecycle gate: Check if credential was already consumed
    if (checkInRecord.isUsed) {
      if (appointment.status === DOMAIN_APPOINTMENT_STATUS.WAITING) {
        return appointment;
      }
      throw new CheckInAlreadyUsedError(
        'Kredensial check-in ini sudah pernah digunakan.',
      );
    }

    // Lifecycle gate: Check if credential has expired
    if (new Date() > checkInRecord.expiresAt) {
      throw new CheckInExpiredError(
        'Kredensial check-in telah kedaluwarsa. Silakan minta kode baru pada admin klinik.',
      );
    }

    // Invariants: Assigned doctor and examination room are mandatory
    if (!appointment.staffId && !appointment.doctorId) {
      throw new AppointmentMissingDoctorError(appointment.id, 'check-in');
    }

    if (!appointment.roomId) {
      throw new AppointmentMissingRoomError(appointment.id, 'check-in');
    }

    if (appointment.status === DOMAIN_APPOINTMENT_STATUS.WAITING) {
      return appointment;
    }

    if (
      appointment.status !== DOMAIN_APPOINTMENT_STATUS.BOOKED &&
      appointment.status !== DOMAIN_APPOINTMENT_STATUS.LATE
    ) {
      throw new InvalidStatusTransitionError(
        appointment.status,
        DOMAIN_APPOINTMENT_STATUS.WAITING,
      );
    }

    // Check-in window validation
    if (appointment.appointmentDate && this.policyReader) {
      const thresholds = await this.policyReader.getQueueThresholds();
      const checkInEval = isAppointmentWithinCheckInWindow({
        scheduledDate: appointment.appointmentDate,
        scheduledStartTime: appointment.scheduledStartTime,
        scheduledEndTime: appointment.scheduledEndTime,
        todayDateStr: this.clinicTimeService.today(),
        currentTimeStr: this.clinicTimeService.getCurrentTimeString(),
        arriveEarlyMinutes: thresholds.arriveEarlyMinutes,
        overflowToleranceMinutes: thresholds.overflowToleranceMinutes,
      });

      if (!checkInEval.isOpen) {
        if (checkInEval.reason === 'TOO_EARLY') {
          throw new CheckInWindowTooEarlyError(checkInEval.openTimeStr);
        }
        if (checkInEval.reason === 'NOT_TODAY') {
          throw new CheckInNotTodayError(appointment.appointmentDate);
        }
        if (checkInEval.reason === 'EXPIRED') {
          throw new CheckInWindowExpiredError(checkInEval.closeTimeStr);
        }
        throw new BadRequestException('Waktu check-in tidak valid.');
      }
    }

    return this.finalizeCheckIn(appointment, checkInRecord.id, actorUser);
  }

  /**
   * Finalizes check-in transition to WAITING, marks credential as used,
   * invalidates queue caches, and emits realtime & push events.
   */
  async finalizeCheckIn(
    appointment: AppointmentEntity,
    checkInRecordId: string,
    actorUser?: any,
  ): Promise<AppointmentEntity> {
    const actorUserId = actorUser?.id || actorUser?.sub || null;

    const updated = await this.appointmentRepo.updateStatus(
      appointment.id,
      DOMAIN_APPOINTMENT_STATUS.WAITING,
      undefined,
      'Check-in mandiri/kiosk kedatangan pasien di klinik',
    );

    if (!updated) {
      throw new NotFoundException(
        `Gagal memperbarui status janji temu ${appointment.id}`,
      );
    }

    await this.checkInRepo.markAsUsed(checkInRecordId, actorUserId);

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
      status: DOMAIN_APPOINTMENT_STATUS.WAITING,
      previousStatus: DOMAIN_APPOINTMENT_STATUS.BOOKED,
      queueNumber: Number(updated.queueNumber) || 1,
      practitionerId: updated.staffId || '',
      patientUserId: updated.patientUserId,
    });

    if (this.queueEventPublisher && updated.appointmentDate) {
      this.queueEventPublisher
        .publishProgression({
          eventType: 'checked_in',
          serviceDate: updated.appointmentDate,
          appointmentId: updated.id,
        })
        .catch((err) => {
          this.logger.warn(
            `Failed to publish queue progression on check-in for ${updated.id}: ${err.message}`,
          );
        });
    }

    if (this.notificationPublisher) {
      await this.notificationPublisher.publishCheckedIn(updated, actorUser);
    }

    const targetUserId =
      updated.parentUserId || updated.patientUserId || updated.createdBy;
    if (this.pushNotification && targetUserId) {
      this.pushNotification
        .sendPush({
          userId: targetUserId,
          title: 'Check-in Berhasil',
          body: `Pasien ${updated.patientName || 'Pasien'} (Nomor antrean ${updated.queueNumber}) telah berhasil check-in dan kini menunggu panggilan di ${updated.poliklinikName || 'Poliklinik'}.`,
          data: {
            appointmentId: updated.id,
            queueNumber: String(updated.queueNumber),
            status: DOMAIN_APPOINTMENT_STATUS.WAITING,
            checkedInAt: new Date().toISOString(),
          },
        })
        .catch((err) => {
          this.logger.warn(
            `Push notification failed on check-in for target ${targetUserId}: ${err.message}`,
          );
        });
    }

    return updated;
  }
}

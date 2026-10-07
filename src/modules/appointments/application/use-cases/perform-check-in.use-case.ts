import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { RedisService } from '../../../../common/redis/redis.service';
import { DOMAIN_APPOINTMENT_STATUS } from '../../domain/constants/appointment-lifecycle.constants';
import type { AppointmentEntity } from '../../domain/entities/appointment.entity';
import {
  APPOINTMENT_REPOSITORY,
  type AppointmentRepository,
} from '../../domain/repositories/appointment.repository';
import { isAppointmentLate } from '../../domain/services/appointment-lateness.predicate';
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

export interface PerformCheckInInput {
  token?: string;
  manualCode?: string;
  appointmentId?: string;
}

@Injectable()
export class PerformCheckInUseCase {
  private readonly logger = new Logger(PerformCheckInUseCase.name);

  constructor(
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepo: AppointmentRepository,
    @Inject(APPOINTMENT_CHECK_IN_REPOSITORY_PORT)
    private readonly checkInRepo: AppointmentCheckInRepositoryPort,
    @Inject(REALTIME_EMITTER_PORT)
    private readonly realtimeEmitter: RealtimeEmitterPort,
    @Optional()
    @Inject(PUSH_NOTIFICATION_PORT)
    private readonly pushNotification?: PushNotificationPort,
    @Optional()
    private readonly redisService?: RedisService,
  ) {}

  async execute(
    input: PerformCheckInInput,
    actorUser?: any,
  ): Promise<AppointmentEntity> {
    const { token, manualCode } = input;
    if (!token && !manualCode) {
      throw new BadRequestException(
        'Token QR atau Kode Verifikasi Manual wajib disertakan untuk melakukan check-in.',
      );
    }

    let checkInRecord = null;
    if (token) {
      checkInRecord = await this.checkInRepo.findByToken(token.trim());
    } else if (manualCode) {
      const cleanCode = manualCode
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
      checkInRecord = await this.checkInRepo.findByManualCode(cleanCode);
    }

    if (!checkInRecord) {
      throw new BadRequestException(
        'Kode atau QR token check-in tidak valid atau sudah digunakan.',
      );
    }

    if (checkInRecord.isUsed) {
      throw new BadRequestException(
        'Kode atau QR token check-in ini sudah pernah digunakan.',
      );
    }

    if (new Date() > checkInRecord.expiresAt) {
      throw new BadRequestException(
        'QR token check-in telah kedaluwarsa. Silakan minta admin membuat QR baru.',
      );
    }

    const appointment = await this.appointmentRepo.findById(
      checkInRecord.appointmentId,
    );
    if (!appointment) {
      throw new NotFoundException('Janji temu tidak ditemukan.');
    }

    if (appointment.status !== DOMAIN_APPOINTMENT_STATUS.BOOKED) {
      throw new BadRequestException(
        `Janji temu ini tidak dalam status "Sudah Buat Janji" (status saat ini: ${appointment.status}).`,
      );
    }

    const scheduledDateObj = new Date(
      `${appointment.appointmentDate}T${appointment.scheduledStartTime || '00:00:00'}`,
    );
    if (isAppointmentLate(scheduledDateObj)) {
      throw new BadRequestException(
        'Janji temu telah melewati batas waktu kedatangan (kedaluwarsa).',
      );
    }

    const actorUserId = actorUser?.id || actorUser?.sub || null;

    // Transition appointment status to WAITING and mark checkedInAt
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

    // Mark check-in record as used
    await this.checkInRepo.markAsUsed(checkInRecord.id, actorUserId);

    // Invalidate caches
    if (this.redisService) {
      await Promise.allSettled([
        this.redisService.deleteByPrefix('queue:daily'),
        this.redisService.deleteByPrefix('queue:display'),
        this.redisService.invalidateTags(
          'queue',
          'daily',
          'display',
          'appointments',
        ),
      ]);
    }

    // Emit realtime event
    await this.realtimeEmitter.emitStatusChanged({
      appointmentId: updated.id,
      status: DOMAIN_APPOINTMENT_STATUS.WAITING,
      previousStatus: DOMAIN_APPOINTMENT_STATUS.BOOKED,
      queueNumber: Number(updated.queueNumber) || 1,
      practitionerId: updated.staffId || '',
    });

    // Send push notification to target user (parent/direct)
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

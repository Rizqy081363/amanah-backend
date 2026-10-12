import {
  BadRequestException,
  ForbiddenException,
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

    const appointment = await this.appointmentRepo.findById(
      checkInRecord.appointmentId,
    );
    if (!appointment) {
      throw new NotFoundException('Janji temu tidak ditemukan.');
    }

    const userRole = (
      actorUser?.systemRole ||
      (typeof actorUser?.role === 'object' && actorUser?.role !== null
        ? actorUser.role.code || actorUser.role.name
        : actorUser?.role)
    )
      ?.toString()
      .toUpperCase();

    if (actorUser && userRole === 'PATIENT') {
      const callerUserId = actorUser.id || actorUser.sub;
      const isOwner =
        callerUserId === appointment.patientUserId ||
        callerUserId === appointment.parentUserId ||
        callerUserId === appointment.createdBy ||
        actorUser.patient?.id === appointment.patientId;
      if (!isOwner) {
        throw new ForbiddenException(
          'Anda tidak memiliki izin untuk melakukan check-in janji temu ini.',
        );
      }
    }

    if (checkInRecord.isUsed) {
      if (appointment.status === DOMAIN_APPOINTMENT_STATUS.WAITING) {
        return appointment;
      }
      throw new BadRequestException(
        'Kode atau QR token check-in ini sudah pernah digunakan.',
      );
    }

    if (!appointment.staffId && !appointment.doctorId) {
      throw new BadRequestException(
        'Dokter penanggung jawab belum ditugaskan untuk janji temu ini. Pasien tidak dapat check-in sebelum dokter ditugaskan.',
      );
    }

    if (!appointment.roomId) {
      throw new BadRequestException(
        'Ruangan periksa belum ditugaskan untuk janji temu ini. Pasien tidak dapat check-in sebelum ruangan ditugaskan.',
      );
    }

    if (appointment.status === DOMAIN_APPOINTMENT_STATUS.WAITING) {
      return appointment;
    }

    if (appointment.status !== DOMAIN_APPOINTMENT_STATUS.BOOKED) {
      throw new BadRequestException(
        `Janji temu ini tidak dalam status "Sudah Buat Janji" (status saat ini: ${appointment.status}).`,
      );
    }

    // In the queue ticketing model, physically attending patients are never rejected.
    // Check-in transitions status to WAITING and marks physical arrival at clinic.

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

    await this.checkInRepo.markAsUsed(checkInRecord.id, actorUserId);

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
    });

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

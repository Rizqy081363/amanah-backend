import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DEFAULT_CHECK_IN_CONFIG,
  hoursToMilliseconds,
  TIME_CONSTANTS,
} from '../../domain/constants/appointment-check-in.config';
import { DOMAIN_APPOINTMENT_STATUS } from '../../domain/constants/appointment-lifecycle.constants';
import type {
  AppointmentCheckInEntity,
  CheckInQrData,
} from '../../domain/entities/appointment-check-in.entity';
import {
  APPOINTMENT_REPOSITORY,
  type AppointmentRepository,
} from '../../domain/repositories/appointment.repository';
import { isAppointmentLate } from '../../domain/services/appointment-lateness.predicate';
import { AppointmentPolicyReader } from '../../domain/services/appointment-policy.reader';
import {
  APPOINTMENT_CHECK_IN_REPOSITORY_PORT,
  type AppointmentCheckInRepositoryPort,
} from '../ports/appointment-check-in.repository.port';

const UNCONFUSABLE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class GenerateCheckInQrUseCase {
  constructor(
    @Inject(APPOINTMENT_REPOSITORY)
    private readonly appointmentRepo: AppointmentRepository,
    @Inject(APPOINTMENT_CHECK_IN_REPOSITORY_PORT)
    private readonly checkInRepo: AppointmentCheckInRepositoryPort,
    private readonly policyReader: AppointmentPolicyReader,
  ) {}

  private generateManualCode(length: number): string {
    let result = '';
    for (let i = 0; i < length; i++) {
      const idx = Math.floor(Math.random() * UNCONFUSABLE_CHARS.length);
      result += UNCONFUSABLE_CHARS[idx];
    }
    return result;
  }

  async execute(
    appointmentId: string,
    actorUserId?: string,
  ): Promise<CheckInQrData> {
    const apt = await this.appointmentRepo.findById(appointmentId);
    if (!apt) {
      throw new NotFoundException(
        `Janji temu dengan ID ${appointmentId} tidak ditemukan`,
      );
    }

    if (apt.status !== DOMAIN_APPOINTMENT_STATUS.BOOKED) {
      throw new BadRequestException(
        `QR Check-in hanya dapat dibuat untuk janji temu dengan status "Sudah Buat Janji" (status saat ini: ${apt.status})`,
      );
    }

    if (!apt.staffId && !apt.doctorId) {
      throw new BadRequestException(
        'Dokter penanggung jawab belum ditugaskan. QR Check-in hanya dapat dibuat setelah dokter ditugaskan.',
      );
    }

    if (!apt.roomId) {
      throw new BadRequestException(
        'Ruangan periksa belum ditugaskan. QR Check-in hanya dapat dibuat setelah ruangan ditugaskan.',
      );
    }

    const windowHours = await this.policyReader.getCheckInWindowHours();
    const scheduledDateObj = new Date(
      `${apt.appointmentDate}T${apt.scheduledStartTime || '00:00:00'}`,
    );

    if (isAppointmentLate(scheduledDateObj, new Date(), windowHours)) {
      throw new BadRequestException(
        'Batas waktu check-in janji temu telah berakhir (janji temu berstatus Terlambat)',
      );
    }

    // Check if there is already an active, unused and unexpired token in database
    const existing =
      await this.checkInRepo.findActiveByAppointmentId(appointmentId);

    let activeRecord: AppointmentCheckInEntity;

    if (existing) {
      // PERSISTENT & IDEMPOTENT: Reuse existing active token and exact database expiration
      activeRecord = existing;
    } else {
      // First generation: calculate deadline dynamically from creation time (Option 2)
      await this.checkInRepo.invalidateExistingTokens(appointmentId);

      const windowMs = hoursToMilliseconds(windowHours);
      const expiresAt = new Date(Date.now() + windowMs);

      const token = randomUUID();
      const manualCode = this.generateManualCode(
        DEFAULT_CHECK_IN_CONFIG.codeLength,
      );

      activeRecord = await this.checkInRepo.createCheckIn({
        appointmentId,
        token,
        manualCode,
        expiresAt,
        createdBy: actorUserId,
      });
    }

    const remainingSeconds = Math.max(
      0,
      Math.floor(
        (activeRecord.expiresAt.getTime() - Date.now()) /
          TIME_CONSTANTS.MILLISECONDS_PER_SECOND,
      ),
    );

    const qrPayload = JSON.stringify({
      type: 'APPOINTMENT_CHECK_IN',
      appointmentId: apt.id,
      token: activeRecord.token,
      code: activeRecord.manualCode,
      bookingCode: apt.bookingCode || '',
    });

    return {
      appointmentId: apt.id,
      patientName: apt.patientName || 'Pasien',
      queueNumber: String(apt.queueNumber),
      poliklinikName: apt.poliklinikName || 'Poliklinik',
      doctorName: apt.doctorName || 'Dokter',
      scheduledDate: apt.appointmentDate,
      token: activeRecord.token,
      manualCode: activeRecord.manualCode,
      qrPayload,
      appointmentEligibilityDeadline: activeRecord.expiresAt.toISOString(),
      expiresAt: activeRecord.expiresAt.toISOString(),
      remainingSeconds,
    };
  }
}

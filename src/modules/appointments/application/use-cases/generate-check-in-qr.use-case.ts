import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DEFAULT_CHECK_IN_CONFIG } from '../../domain/constants/appointment-check-in.config';
import { DOMAIN_APPOINTMENT_STATUS } from '../../domain/constants/appointment-lifecycle.constants';
import type { CheckInQrData } from '../../domain/entities/appointment-check-in.entity';
import {
  APPOINTMENT_REPOSITORY,
  type AppointmentRepository,
} from '../../domain/repositories/appointment.repository';
import { isAppointmentLate } from '../../domain/services/appointment-lateness.predicate';
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

    const scheduledDateObj = new Date(
      `${apt.appointmentDate}T${apt.scheduledStartTime || '00:00:00'}`,
    );
    if (isAppointmentLate(scheduledDateObj)) {
      throw new BadRequestException(
        'Janji temu telah melewati batas waktu check-in (kedaluwarsa).',
      );
    }

    // Invalidate any existing unused tokens for this appointment
    await this.checkInRepo.invalidateExistingTokens(appointmentId);

    const token = randomUUID();
    const manualCode = this.generateManualCode(
      DEFAULT_CHECK_IN_CONFIG.codeLength,
    );
    const ttlMs = DEFAULT_CHECK_IN_CONFIG.qrCodeTtlMinutes * 60 * 1000;
    const expiresAt = new Date(Date.now() + ttlMs);

    await this.checkInRepo.createCheckIn({
      appointmentId,
      token,
      manualCode,
      expiresAt,
      createdBy: actorUserId,
    });

    const qrPayload = JSON.stringify({
      type: 'APPOINTMENT_CHECK_IN',
      appointmentId: apt.id,
      token,
      code: manualCode,
      bookingCode: apt.bookingCode || '',
    });

    return {
      appointmentId: apt.id,
      patientName: apt.patientName || 'Pasien',
      queueNumber: String(apt.queueNumber),
      poliklinikName: apt.poliklinikName || 'Poliklinik',
      doctorName: apt.doctorName || 'Dokter',
      scheduledDate: apt.appointmentDate,
      token,
      manualCode,
      qrPayload,
      expiresAt: expiresAt.toISOString(),
    };
  }
}

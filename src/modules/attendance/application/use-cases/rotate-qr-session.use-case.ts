import { Inject, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { normalizeShift } from '../../domain/constants/attendance.constants';
import { QrSessionEntity } from '../../domain/entities/qr-session.entity';
import {
  ATTENDANCE_REPOSITORY,
  AttendanceRepository,
} from '../../domain/repositories/attendance.repository';

export interface RotateQrSessionInput {
  sessionType?: string;
  shift?: string;
  rotationSeconds?: number;
  context?: string;
  createdBy?: string;
}

@Injectable()
export class RotateQrSessionUseCase {
  constructor(
    @Inject(ATTENDANCE_REPOSITORY)
    private readonly repo: AttendanceRepository,
  ) {}

  async execute(input: RotateQrSessionInput): Promise<QrSessionEntity> {
    const sessionType =
      input.sessionType === 'staff_identity'
        ? 'staff_identity'
        : 'location_check_in';
    const shift = normalizeShift(input.shift);
    const rotationSeconds =
      input.rotationSeconds && input.rotationSeconds > 0
        ? input.rotationSeconds
        : 30;

    // Cryptographically secure 6-character alphanumeric token
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const randomBytes = crypto.randomBytes(6);
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(randomBytes[i] % chars.length);
    }

    const now = new Date();
    // Valid for rotation duration + 15 seconds grace buffer
    const validUntil = new Date(now.getTime() + (rotationSeconds + 15) * 1000);

    return this.repo.createQrSession({
      codeHash: code,
      sessionType,
      shift,
      rotationSeconds,
      context: input.context || 'Terminal Utama Presensi Klinik',
      validFrom: now.toISOString(),
      validUntil: validUntil.toISOString(),
      createdBy: input.createdBy || null,
    });
  }

  async getActiveSession(
    sessionType: string = 'location_check_in',
  ): Promise<QrSessionEntity> {
    const active = await this.repo.findActiveQrSession(sessionType);
    if (active) {
      return active;
    }
    return this.execute({ sessionType });
  }
}

import { BadRequestException, Injectable } from '@nestjs/common';
import type { AppointmentEntity } from '../../domain/entities/appointment.entity';
import { PerformManualCheckInUseCase } from './perform-manual-check-in.use-case';
import { PerformQrCheckInUseCase } from './perform-qr-check-in.use-case';

export interface PerformCheckInInput {
  token?: string;
  manualCode?: string;
  appointmentId?: string;
}

@Injectable()
export class PerformCheckInUseCase {
  constructor(
    private readonly qrCheckInUseCase: PerformQrCheckInUseCase,
    private readonly manualCheckInUseCase: PerformManualCheckInUseCase,
  ) {}

  async execute(
    input: PerformCheckInInput,
    actorUser?: any,
  ): Promise<AppointmentEntity> {
    const { token, manualCode } = input;

    if (token && typeof token === 'string' && token.trim()) {
      return this.qrCheckInUseCase.execute({ token: token.trim() }, actorUser);
    }

    if (manualCode && typeof manualCode === 'string' && manualCode.trim()) {
      return this.manualCheckInUseCase.execute(
        { manualCode: manualCode.trim() },
        actorUser,
      );
    }

    throw new BadRequestException(
      'Token QR atau Kode Verifikasi Manual wajib disertakan untuk melakukan check-in.',
    );
  }
}

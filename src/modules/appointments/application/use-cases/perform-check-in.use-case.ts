import { BadRequestException, Injectable } from '@nestjs/common';
import type { AppointmentEntity } from '../../domain/entities/appointment.entity';
import { PerformManualCheckInUseCase } from './perform-manual-check-in.use-case';
import { PerformQrCheckInUseCase } from './perform-qr-check-in.use-case';

export interface PerformCheckInInput {
  token?: string;
  manualCode?: string;
  method?: 'qr' | 'manual';
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
    const { token, manualCode, method } = input;

    if (method === 'qr' || (token && typeof token === 'string' && token.trim())) {
      const qrPayload = (token && token.trim()) || (manualCode && manualCode.trim()) || '';
      return this.qrCheckInUseCase.execute({ token: qrPayload }, actorUser);
    }

    if (
      method === 'manual' ||
      (manualCode && typeof manualCode === 'string' && manualCode.trim())
    ) {
      const codePayload = (manualCode && manualCode.trim()) || (token && token.trim()) || '';
      return this.manualCheckInUseCase.execute(
        { manualCode: codePayload },
        actorUser,
      );
    }

    throw new BadRequestException(
      'Kredensial check-in (Barcode QR atau Kode Verifikasi) wajib disertakan untuk melakukan check-in.',
    );
  }
}

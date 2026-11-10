import { Inject, Injectable } from '@nestjs/common';
import type { AppointmentEntity } from '../../domain/entities/appointment.entity';
import { InvalidCheckInCodeError } from '../../domain/errors/appointment-domain.errors';
import {
  APPOINTMENT_CHECK_IN_REPOSITORY_PORT,
  type AppointmentCheckInRepositoryPort,
} from '../ports/appointment-check-in.repository.port';
import { AppointmentCheckInLifecycleService } from '../services/appointment-check-in-lifecycle.service';

export interface PerformManualCheckInInput {
  manualCode: string;
}

@Injectable()
export class PerformManualCheckInUseCase {
  constructor(
    @Inject(APPOINTMENT_CHECK_IN_REPOSITORY_PORT)
    private readonly checkInRepo: AppointmentCheckInRepositoryPort,
    private readonly lifecycleService: AppointmentCheckInLifecycleService,
  ) {}

  async execute(
    input: PerformManualCheckInInput,
    actorUser?: any,
  ): Promise<AppointmentEntity> {
    const rawCode = input.manualCode ? String(input.manualCode) : '';
    const cleanCode = rawCode
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');

    if (!cleanCode) {
      throw new InvalidCheckInCodeError(
        'Kode check-in manual wajib disertakan (6 karakter).',
      );
    }

    const checkInRecord = await this.checkInRepo.findByManualCode(cleanCode);
    if (!checkInRecord) {
      throw new InvalidCheckInCodeError(
        'Kode check-in manual tidak valid atau tidak terdaftar.',
      );
    }

    return this.lifecycleService.validateAndFinalize(checkInRecord, actorUser);
  }
}

import { Inject, Injectable } from '@nestjs/common';
import type { AppointmentEntity } from '../../domain/entities/appointment.entity';
import { InvalidCheckInQrError } from '../../domain/errors/appointment-domain.errors';
import {
  APPOINTMENT_CHECK_IN_REPOSITORY_PORT,
  type AppointmentCheckInRepositoryPort,
} from '../ports/appointment-check-in.repository.port';
import { AppointmentCheckInLifecycleService } from '../services/appointment-check-in-lifecycle.service';

export interface PerformQrCheckInInput {
  token: string;
}

@Injectable()
export class PerformQrCheckInUseCase {
  constructor(
    @Inject(APPOINTMENT_CHECK_IN_REPOSITORY_PORT)
    private readonly checkInRepo: AppointmentCheckInRepositoryPort,
    private readonly lifecycleService: AppointmentCheckInLifecycleService,
  ) {}

  async execute(
    input: PerformQrCheckInInput,
    actorUser?: any,
  ): Promise<AppointmentEntity> {
    const rawToken = input.token ? String(input.token).trim() : '';
    if (!rawToken) {
      throw new InvalidCheckInQrError('Barcode check-in tidak valid atau tidak disertakan.');
    }

    let checkInRecord = await this.checkInRepo.findByToken(rawToken);
    if (!checkInRecord && rawToken.length === 6) {
      checkInRecord = await this.checkInRepo.findByManualCode(
        rawToken.toUpperCase(),
      );
    }

    if (!checkInRecord) {
      throw new InvalidCheckInQrError(
        'Barcode check-in tidak valid atau tidak terdaftar.',
      );
    }

    return this.lifecycleService.validateAndFinalize(checkInRecord, actorUser);
  }
}

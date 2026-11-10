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
      throw new InvalidCheckInQrError('Token QR Code check-in wajib disertakan.');
    }

    const checkInRecord = await this.checkInRepo.findByToken(rawToken);
    if (!checkInRecord) {
      throw new InvalidCheckInQrError(
        'Token QR check-in tidak valid atau tidak terdaftar.',
      );
    }

    return this.lifecycleService.validateAndFinalize(checkInRecord, actorUser);
  }
}

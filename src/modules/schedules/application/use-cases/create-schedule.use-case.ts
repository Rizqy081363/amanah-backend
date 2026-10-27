import {
  type AuthenticatedUser,
  isAdminUser,
} from '@common/auth';
import {
  DomainForbiddenException,
  DomainValidationException,
} from '@common/exceptions';
import {
  SCHEDULE_REPOSITORY,
  type ScheduleRepository,
} from '@modules/schedules/domain/repositories/schedule.repository';
import type { ScheduleEntity } from '@modules/schedules/domain/entities/schedule.entity';
import type { CreateScheduleInput } from '../../presentation/schemas/create-schedule.schema';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class CreateScheduleUseCase {
  constructor(
    @Inject(SCHEDULE_REPOSITORY)
    private readonly scheduleRepo: ScheduleRepository,
  ) {}

  async execute(
    input: CreateScheduleInput,
    user: AuthenticatedUser,
  ): Promise<ScheduleEntity> {
    let staffId: string;

    if (isAdminUser(user)) {
      if (!input.staffId) {
        throw new DomainValidationException(
          'Parameter staffId wajib disertakan oleh Administrator saat membuat jadwal',
        );
      }
      staffId = input.staffId;
    } else {
      const doctorPractitionerId = user.staff?.practitionerId;
      if (!doctorPractitionerId) {
        throw new DomainForbiddenException(
          'Akun Anda belum terhubung dengan profil praktisi medis klinik',
        );
      }
      if (input.staffId && input.staffId !== doctorPractitionerId) {
        throw new DomainForbiddenException(
          'Akses ditolak: Staf hanya dapat membuat jadwal praktek untuk akun sendiri',
        );
      }
      staffId = doctorPractitionerId;
    }

    return this.scheduleRepo.create({
      staffId,
      poliklinikId: input.poliklinikId,
      roomId: input.roomId,
      serviceId: input.serviceId,
      dayOfWeek: null,
      scheduleDate: input.scheduleDate,
      session: input.session,
      sessionLabel: input.session,
      startTime: input.startTime,
      endTime: input.endTime,
      isAvailable: input.isAvailable,
      notes: input.notes,
    });
  }
}

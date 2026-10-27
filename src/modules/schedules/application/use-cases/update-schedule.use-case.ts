import {
  type AuthenticatedUser,
  isAdminUser,
} from '@common/auth';
import {
  DomainForbiddenException,
  EntityNotFoundException,
} from '@common/exceptions';
import {
  SCHEDULE_REPOSITORY,
  type ScheduleRepository,
} from '@modules/schedules/domain/repositories/schedule.repository';
import type { ScheduleEntity } from '@modules/schedules/domain/entities/schedule.entity';
import type { UpdateScheduleInput } from '../../presentation/schemas/update-schedule.schema';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class UpdateScheduleUseCase {
  constructor(
    @Inject(SCHEDULE_REPOSITORY)
    private readonly scheduleRepo: ScheduleRepository,
  ) {}

  async execute(
    id: string,
    input: UpdateScheduleInput,
    user: AuthenticatedUser,
  ): Promise<ScheduleEntity> {
    const existing = await this.scheduleRepo.findById(id);
    if (!existing) {
      throw new EntityNotFoundException('Jadwal', id);
    }

    if (!isAdminUser(user)) {
      const doctorPractitionerId = user.staff?.practitionerId;
      if (!doctorPractitionerId || existing.staffId !== doctorPractitionerId) {
        throw new DomainForbiddenException(
          'Akses ditolak: Anda hanya berwenang mengelola jadwal praktek Anda sendiri',
        );
      }
    }

    const updated = await this.scheduleRepo.update(id, {
      session: input.session,
      sessionLabel: input.session,
      startTime: input.startTime,
      endTime: input.endTime,
      roomId: input.roomId,
      poliklinikId: input.poliklinikId,
      serviceId: input.serviceId,
      status: input.status,
      isAvailable: input.isAvailable,
      notes: input.notes,
    });

    if (!updated) {
      throw new EntityNotFoundException('Jadwal', id);
    }

    return updated;
  }
}

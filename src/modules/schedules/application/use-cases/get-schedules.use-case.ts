import {
  SCHEDULE_REPOSITORY,
  type ScheduleRepository,
} from '@modules/schedules/domain/repositories/schedule.repository';
import type { ScheduleEntity } from '@modules/schedules/domain/entities/schedule.entity';
import type { QueryScheduleInput } from '../../presentation/schemas/query-schedule.schema';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetSchedulesUseCase {
  constructor(
    @Inject(SCHEDULE_REPOSITORY)
    private readonly scheduleRepo: ScheduleRepository,
  ) {}

  async execute(input: QueryScheduleInput): Promise<ScheduleEntity[]> {
    const page = input.page;
    const limit = input.limit;
    const offset = (page - 1) * limit;

    return this.scheduleRepo.findAll(limit, offset, {
      poliklinikId: input.poliklinikId,
      staffId: input.staffId,
      date: input.date,
    });
  }
}

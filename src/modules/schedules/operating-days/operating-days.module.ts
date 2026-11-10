import { Module } from '@nestjs/common';
import { CascadeScheduleDeactivationUseCase } from '../application/use-cases/cascade-schedule-deactivation.use-case';
import { OPERATING_DAYS_REPOSITORY } from './domain/repositories/operating-days.repository';
import { DrizzleOperatingDaysRepository } from './infrastructure/drizzle-operating-days.repository';
import { AdminOperatingDaysController } from './presentation/admin-operating-days.controller';

@Module({
  controllers: [AdminOperatingDaysController],
  providers: [
    CascadeScheduleDeactivationUseCase,
    DrizzleOperatingDaysRepository,
    {
      provide: OPERATING_DAYS_REPOSITORY,
      useExisting: DrizzleOperatingDaysRepository,
    },
  ],
  exports: [
    CascadeScheduleDeactivationUseCase,
    DrizzleOperatingDaysRepository,
    OPERATING_DAYS_REPOSITORY,
  ],
})
export class OperatingDaysModule {}

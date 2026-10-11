import { Module } from '@nestjs/common';
import { AdminOperatingDaysController } from './presentation/admin-operating-days.controller';
import { DrizzleOperatingDaysRepository } from './infrastructure/drizzle-operating-days.repository';
import { OPERATING_DAYS_REPOSITORY } from './domain/repositories/operating-days.repository';

@Module({
  controllers: [AdminOperatingDaysController],
  providers: [
    DrizzleOperatingDaysRepository,
    {
      provide: OPERATING_DAYS_REPOSITORY,
      useExisting: DrizzleOperatingDaysRepository,
    },
  ],
  exports: [DrizzleOperatingDaysRepository, OPERATING_DAYS_REPOSITORY],
})
export class OperatingDaysModule {}

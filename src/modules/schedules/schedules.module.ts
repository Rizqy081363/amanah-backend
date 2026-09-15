import { Module } from '@nestjs/common';
import { SCHEDULE_REPOSITORY } from './domain/repositories/schedule.repository';
import { ScheduleDrizzleRepository } from './infrastructure/drizzle/schedule.drizzle-repository';
import { SchedulesController } from './presentation/schedules.controller';

@Module({
  controllers: [SchedulesController],
  providers: [
    {
      provide: SCHEDULE_REPOSITORY,
      useClass: ScheduleDrizzleRepository,
    },
  ],
  exports: [SCHEDULE_REPOSITORY],
})
export class SchedulesModule {}

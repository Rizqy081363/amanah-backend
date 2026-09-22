import { Module } from '@nestjs/common';
import { SCHEDULE_REPOSITORY } from './domain/repositories/schedule.repository';
import { ScheduleDrizzleRepository } from './infrastructure/drizzle/schedule.drizzle-repository';
import { AdminDoctorSchedulesController } from './presentation/admin-doctor-schedules.controller';
import { ClinicalPractitionersController } from './presentation/clinical-practitioners.controller';
import { SchedulesController } from './presentation/schedules.controller';

@Module({
  controllers: [
    SchedulesController,
    AdminDoctorSchedulesController,
    ClinicalPractitionersController,
  ],
  providers: [
    {
      provide: SCHEDULE_REPOSITORY,
      useClass: ScheduleDrizzleRepository,
    },
  ],
  exports: [SCHEDULE_REPOSITORY],
})
export class SchedulesModule {}

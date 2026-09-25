import { Module } from '@nestjs/common';
import { SCHEDULE_REPOSITORY } from './domain/repositories/schedule.repository';
import { AppointmentOccupationQuery } from './infrastructure/drizzle/queries/appointment-occupation.query';
import { ScheduleConflictQuery } from './infrastructure/drizzle/queries/schedule-conflict.query';
import { SchedulePolicyReader } from './infrastructure/drizzle/queries/schedule-policy.reader';
import {
  DrizzleAdminDoctorScheduleDetailQuery,
  DrizzleAdminDoctorScheduleListQuery,
  DrizzleAdminScheduleMutationRepository,
  DrizzleAdminSessionMutationRepository,
  DrizzleClinicalPractitionerRepository,
  DrizzleRescheduleEligibilityEvaluator,
  DrizzleScheduleAvailabilityRepository,
  DrizzleScheduleDayRepository,
  DrizzleScheduleOccupancyRepository,
  DrizzleSchedulePatientRepository,
  DrizzleScheduleReferenceRepository,
  DrizzleScheduleRescheduleRepository,
  DrizzleScheduleSessionRepository,
} from './infrastructure/drizzle/repositories';
import { PractitionerResolver } from './infrastructure/drizzle/resolvers/practitioner.resolver';
import { RoomResolver } from './infrastructure/drizzle/resolvers/room.resolver';
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
    PractitionerResolver,
    RoomResolver,
    SchedulePolicyReader,
    ScheduleConflictQuery,
    AppointmentOccupationQuery,
    DrizzleRescheduleEligibilityEvaluator,
    DrizzleAdminSessionMutationRepository,
    DrizzleScheduleSessionRepository,
    DrizzleScheduleDayRepository,
    DrizzleScheduleReferenceRepository,
    DrizzleScheduleAvailabilityRepository,
    DrizzleScheduleOccupancyRepository,
    DrizzleScheduleRescheduleRepository,
    DrizzleSchedulePatientRepository,
    DrizzleClinicalPractitionerRepository,
    DrizzleAdminDoctorScheduleListQuery,
    DrizzleAdminDoctorScheduleDetailQuery,
    DrizzleAdminScheduleMutationRepository,
    {
      provide: SCHEDULE_REPOSITORY,
      useClass: ScheduleDrizzleRepository,
    },
  ],
  exports: [
    SCHEDULE_REPOSITORY,
    DrizzleScheduleSessionRepository,
    DrizzleScheduleDayRepository,
    DrizzleScheduleReferenceRepository,
    DrizzleScheduleAvailabilityRepository,
    DrizzleScheduleOccupancyRepository,
    DrizzleScheduleRescheduleRepository,
    DrizzleSchedulePatientRepository,
    DrizzleClinicalPractitionerRepository,
    DrizzleAdminDoctorScheduleListQuery,
    DrizzleAdminDoctorScheduleDetailQuery,
    DrizzleAdminScheduleMutationRepository,
    DrizzleAdminSessionMutationRepository,
    DrizzleRescheduleEligibilityEvaluator,
  ],
})
export class SchedulesModule {}

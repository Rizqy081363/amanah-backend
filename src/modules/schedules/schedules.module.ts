import { SCHEDULE_REPOSITORY } from '@modules/schedules/domain/repositories/schedule.repository';
import { AppointmentOccupationQuery } from '@modules/schedules/infrastructure/drizzle/queries/appointment-occupation.query';
import { ScheduleConflictQuery } from '@modules/schedules/infrastructure/drizzle/queries/schedule-conflict.query';
import { SchedulePolicyReader } from '@modules/schedules/infrastructure/drizzle/queries/schedule-policy.reader';
import {
  DrizzleAdminDoctorScheduleDetailQuery,
  DrizzleAdminDoctorScheduleListQuery,
  DrizzleAdminScheduleMutationRepository,
  DrizzleAdminSessionMutationRepository,
  DrizzleClinicalPractitionerRepository,
  DrizzleRescheduleEligibilityEvaluator,
  DrizzleScheduleAvailabilityRepository,
  DrizzleScheduleBootstrapRepository,
  DrizzleScheduleDayRepository,
  DrizzleScheduleOccupancyRepository,
  DrizzleSchedulePatientRepository,
  DrizzleScheduleReferenceRepository,
  DrizzleScheduleRescheduleRepository,
  DrizzleScheduleSessionRepository,
} from '@modules/schedules/infrastructure/drizzle/repositories';
import { PractitionerResolver } from '@modules/schedules/infrastructure/drizzle/resolvers/practitioner.resolver';
import { RoomResolver } from '@modules/schedules/infrastructure/drizzle/resolvers/room.resolver';
import { ScheduleDrizzleRepository } from '@modules/schedules/infrastructure/drizzle/schedule.drizzle-repository';
import { AdminDoctorSchedulesController } from '@modules/schedules/presentation/admin-doctor-schedules.controller';
import { ClinicalPractitionersController } from '@modules/schedules/presentation/clinical-practitioners.controller';
import { PatientScheduleBookingController } from '@modules/schedules/presentation/patient-schedule-booking.controller';
import { SchedulesController } from '@modules/schedules/presentation/schedules.controller';
import { RedisModule } from '@common/redis/redis.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [RedisModule],
  controllers: [
    PatientScheduleBookingController,
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
    DrizzleScheduleBootstrapRepository,
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
    PractitionerResolver,
    RoomResolver,
    ScheduleConflictQuery,
    AppointmentOccupationQuery,
    SchedulePolicyReader,
    DrizzleScheduleSessionRepository,
    DrizzleScheduleDayRepository,
    DrizzleScheduleReferenceRepository,
    DrizzleScheduleAvailabilityRepository,
    DrizzleScheduleOccupancyRepository,
    DrizzleScheduleBootstrapRepository,
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
